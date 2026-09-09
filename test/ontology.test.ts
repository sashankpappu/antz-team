import { Confidence, Dimension } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  ALL_SLOTS,
  ONTOLOGY,
  TOTAL_SLOT_COUNT,
  assertSlot,
  danglingUnlockRefs,
  downstreamUnlock,
  entryOrderForRole,
  findSlot,
  openSlots,
  score,
  slotConfidence,
  type ScorableClaim,
} from '@/lib/ontology';

const claim = (
  dimension: Dimension,
  slot: string,
  confidence: Confidence = Confidence.HIGH,
): ScorableClaim => ({ dimension, slot, confidence });

describe('the meta-ontology', () => {
  it('covers all nine dimensions', () => {
    expect(ONTOLOGY).toHaveLength(9);
    expect(new Set(ONTOLOGY.map((d) => d.dimension)).size).toBe(9);
  });

  it('gives every dimension at least three scoreable slots', () => {
    for (const dimension of ONTOLOGY) {
      expect(dimension.slots.length).toBeGreaterThanOrEqual(3);
    }
    expect(TOTAL_SLOT_COUNT).toBe(ALL_SLOTS.length);
  });

  it('has no unlock edge pointing at a slot that does not exist', () => {
    // A dangling edge silently under-weights a foundational question, which is
    // the kind of bug that shows up as "why did it ask that first".
    expect(danglingUnlockRefs()).toEqual([]);
  });

  it('uses no jargon in the questions it forces', () => {
    const banned = [
      'system of record',
      'actor',
      'sla',
      'integration',
      'schema',
      'entity',
      'workflow',
      'api',
    ];
    for (const { def } of ALL_SLOTS) {
      const text = def.forces.toLowerCase();
      for (const word of banned) {
        expect(text.includes(word), `"${def.forces}" contains "${word}"`).toBe(false);
      }
    }
  });

  it('rejects a claim that does not map to a real slot', () => {
    expect(() => assertSlot(Dimension.SYSTEMS, 'not_a_slot')).toThrow(/meta-ontology/);
    expect(() => assertSlot(Dimension.SYSTEMS, 'systems_read')).not.toThrow();
  });

  it('reuses the slot key "frequency" across two dimensions', () => {
    // Which is why the dimension/slot pair has to be validated, not just the key.
    expect(findSlot(Dimension.TRIGGERS, 'frequency')).toBeDefined();
    expect(findSlot(Dimension.EXCEPTIONS, 'frequency')).toBeDefined();
  });

  it('ranks Systems and Actors as unlocking the most', () => {
    const systemsRead = downstreamUnlock(Dimension.SYSTEMS, 'systems_read');
    const performer = downstreamUnlock(Dimension.ACTORS, 'performer');
    const seasonality = downstreamUnlock(Dimension.TRIGGERS, 'seasonality');

    expect(systemsRead).toBeGreaterThan(seasonality);
    expect(performer).toBeGreaterThan(seasonality);
  });
});

describe('scoring', () => {
  it('scores an empty store at zero', () => {
    const card = score([]);
    expect(card.overallPct).toBe(0);
    expect(card.filledSlots).toBe(0);
    expect(openSlots(card)).toHaveLength(TOTAL_SLOT_COUNT);
  });

  it('does not let an inferred claim fill a slot', () => {
    const card = score([claim(Dimension.SYSTEMS, 'systems_read', Confidence.LOW)]);
    expect(card.filledSlots).toBe(0);
    expect(slotConfidence(
      [claim(Dimension.SYSTEMS, 'systems_read', Confidence.LOW)],
      Dimension.SYSTEMS,
      'systems_read',
    )).toBeLessThan(1);
  });

  it('fills a slot at medium and at high, and only counts it once', () => {
    const medium = score([claim(Dimension.SYSTEMS, 'systems_read', Confidence.MEDIUM)]);
    expect(medium.filledSlots).toBe(1);

    const twice = score([
      claim(Dimension.SYSTEMS, 'systems_read', Confidence.HIGH),
      claim(Dimension.SYSTEMS, 'systems_read', Confidence.MEDIUM),
    ]);
    expect(twice.filledSlots).toBe(1);
  });

  it('ignores a superseded claim', () => {
    const card = score([
      { dimension: Dimension.SYSTEMS, slot: 'systems_read', confidence: Confidence.HIGH, supersededById: 'x' },
    ]);
    expect(card.filledSlots).toBe(0);
  });

  it('averages dimensions, not slots, so every dimension weighs the same', () => {
    const triggers = ONTOLOGY.find((d) => d.dimension === Dimension.TRIGGERS)!;
    const card = score(triggers.slots.map((s) => claim(Dimension.TRIGGERS, s.key)));

    const triggerScore = card.dimensions.find((d) => d.dimension === Dimension.TRIGGERS)!;
    expect(triggerScore.pct).toBe(100);
    // One of nine dimensions complete is 11%, whatever share of slots that was.
    expect(card.overallPct).toBe(11);
  });

  it('reaches 100% when every slot is filled', () => {
    const card = score(ALL_SLOTS.map((s) => claim(s.dimension, s.slot)));
    expect(card.overallPct).toBe(100);
    expect(openSlots(card)).toEqual([]);
  });
});

describe('role entry order', () => {
  it('puts handoffs first for a COO and decisions first for a CFO', () => {
    expect(entryOrderForRole('Chief Operating Officer')[0]).toBe(Dimension.HANDOFFS);
    expect(entryOrderForRole('Group CFO')[0]).toBe(Dimension.DECISION_RULES);
  });

  it('falls back to the default order for an unknown or missing role', () => {
    const fallback = entryOrderForRole(null);
    expect(fallback[0]).toBe(Dimension.ACTORS);
    expect(entryOrderForRole('Head of Widgets')).toEqual(fallback);
  });

  it('lists all nine dimensions in every order it defines', () => {
    for (const role of ['default', 'coo', 'cfo', 'cio', 'cto', 'sales', 'supply', 'finance', 'operations']) {
      expect(new Set(entryOrderForRole(role)).size).toBe(9);
    }
  });
});
