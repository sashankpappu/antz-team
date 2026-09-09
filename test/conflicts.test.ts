import { Confidence, Dimension } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { candidatePairs, nearDuplicate, type ComparableClaim } from '@/lib/claims/conflicts';
import { keepValidSlots, normaliseConfidence, type ExtractedClaim } from '@/lib/claims/schemas';

let counter = 0;
function claim(content: string, overrides: Partial<ComparableClaim> = {}): ComparableClaim {
  counter += 1;
  return {
    id: `c${counter}`,
    dimension: Dimension.SYSTEMS,
    slot: 'system_of_record',
    content,
    speaker: null,
    confidence: Confidence.HIGH,
    ...overrides,
  };
}

describe('near-duplicate detection', () => {
  it('treats a restatement as the same claim', () => {
    expect(
      nearDuplicate('SAP is the system everyone treats as right', 'SAP is the system everyone treats as right.'),
    ).toBe(true);
  });

  it('does not treat a genuine disagreement as a duplicate', () => {
    expect(
      nearDuplicate('SAP is where the truth lives', 'The shortage tracker is where the truth lives'),
    ).toBe(false);
  });

  it('is not fooled by empty strings', () => {
    expect(nearDuplicate('', '')).toBe(false);
    expect(nearDuplicate('SAP', '')).toBe(false);
  });
});

describe('conflict candidates', () => {
  it('pairs two load-bearing claims on the same slot', () => {
    const pairs = candidatePairs(
      [claim('Approval is automatic')],
      [claim('The finance manager signs off every one')],
    );
    expect(pairs).toHaveLength(1);
  });

  it('ignores claims on different slots', () => {
    const pairs = candidatePairs(
      [claim('Approval is automatic', { slot: 'system_of_record' })],
      [claim('Two hundred a week', { dimension: Dimension.VOLUMES, slot: 'peak' })],
    );
    expect(pairs).toEqual([]);
  });

  it('never flags an inferred claim as a contradiction', () => {
    // A guess disagreeing with a stated fact is noise, not a finding.
    const pairs = candidatePairs(
      [claim('Approval is automatic')],
      [claim('Someone probably signs off', { confidence: Confidence.LOW })],
    );
    expect(pairs).toEqual([]);
  });

  it('ignores a superseded claim', () => {
    const pairs = candidatePairs(
      [claim('Approval is automatic', { supersededById: 'later' })],
      [claim('The finance manager signs off')],
    );
    expect(pairs).toEqual([]);
  });

  it('skips restatements so no model call is wasted on them', () => {
    const pairs = candidatePairs(
      [claim('SAP is where the truth lives')],
      [claim('SAP is where the truth lives')],
    );
    expect(pairs).toEqual([]);
  });

  it('caps how many pairs one ingest can raise', () => {
    const existing = Array.from({ length: 30 }, (_, i) => claim(`prior statement number ${i}`));
    const incoming = Array.from({ length: 30 }, (_, i) => claim(`new statement number ${i}`));
    expect(candidatePairs(existing, incoming, { max: 5 })).toHaveLength(5);
  });

  it('does not pair a claim with itself', () => {
    const same = claim('SAP is where the truth lives');
    expect(candidatePairs([same], [same])).toEqual([]);
  });
});

describe('extraction hygiene', () => {
  const base: ExtractedClaim = {
    dimension: Dimension.SYSTEMS,
    slot: 'systems_read',
    content: 'The planner opens the shortage tracker',
    quote: 'the planner opens the shortage tracker',
    speaker: 'Ravi',
    confidence: 'high',
  };

  it('keeps a quoted high-confidence claim at high', () => {
    expect(normaliseConfidence(base)).toBe(Confidence.HIGH);
  });

  it('forces an unquoted claim down to low however sure the model sounded', () => {
    // No quote means it was inferred, and an inference must never fill a slot.
    expect(normaliseConfidence({ ...base, quote: '' })).toBe(Confidence.LOW);
    expect(normaliseConfidence({ ...base, quote: '   ' })).toBe(Confidence.LOW);
  });

  it('rejects a dimension and slot pair that is not in the ontology', () => {
    const { valid, rejected } = keepValidSlots([
      base,
      // "frequency" is a real slot key, but not on Systems.
      { ...base, dimension: Dimension.SYSTEMS, slot: 'frequency' },
    ]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
