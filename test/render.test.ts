import { Confidence, Dimension } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ClaimIndex, shorten, type RenderClaim } from '@/lib/render/claim-index';
import {
  HOLE,
  actorMapDiagram,
  countHoles,
  currentStateDiagram,
  label,
  systemContextDiagram,
  targetStateDiagram,
} from '@/lib/render/mermaid';
import { MissingTemplateFieldError, cell, fieldsOf, fill, table } from '@/lib/render/template';
import { proseFromClaims, sentence } from '@/lib/render/prose';

let seq = 0;
function claim(
  dimension: Dimension,
  slot: string,
  content: string,
  overrides: Partial<RenderClaim> = {},
): RenderClaim {
  seq += 1;
  return {
    id: `c${seq}`,
    dimension,
    slot,
    content,
    quote: content,
    speaker: null,
    confidence: Confidence.HIGH,
    createdAt: new Date(2026, 0, seq),
    ...overrides,
  };
}

const populated = new ClaimIndex([
  claim(Dimension.ACTORS, 'performer', 'The materials planner'),
  claim(Dimension.ACTORS, 'approver', 'The plant manager'),
  claim(Dimension.SYSTEMS, 'systems_read', 'the shortage tracker'),
  claim(Dimension.SYSTEMS, 'systems_written', 'SAP'),
  claim(Dimension.SYSTEMS, 'system_of_record', 'SAP'),
  claim(Dimension.TRIGGERS, 'what_starts_it', 'the Monday shortage list lands'),
  claim(Dimension.DATA, 'inputs', 'the shortage list'),
]);

const emptyIndex = new ClaimIndex([]);

describe('the claim read model', () => {
  it('prefers the best-evidenced claim on a slot', () => {
    const index = new ClaimIndex([
      claim(Dimension.SYSTEMS, 'system_of_record', 'the tracker', { confidence: Confidence.MEDIUM }),
      claim(Dimension.SYSTEMS, 'system_of_record', 'SAP', { confidence: Confidence.HIGH }),
    ]);
    expect(index.one(Dimension.SYSTEMS, 'system_of_record')?.content).toBe('SAP');
  });

  it('does not let an inferred claim answer for a slot', () => {
    const index = new ClaimIndex([
      claim(Dimension.SYSTEMS, 'system_of_record', 'probably SAP', { confidence: Confidence.LOW }),
    ]);
    expect(index.text(Dimension.SYSTEMS, 'system_of_record')).toBeNull();
    // But it is still on record, and still available as a hypothesis to test.
    expect(index.one(Dimension.SYSTEMS, 'system_of_record')?.content).toBe('probably SAP');
  });

  it('leaves out a superseded claim entirely', () => {
    const index = new ClaimIndex([
      claim(Dimension.SYSTEMS, 'system_of_record', 'SAP', { supersededById: 'later' }),
    ]);
    expect(index.all(Dimension.SYSTEMS, 'system_of_record')).toEqual([]);
    expect(index.claimCount).toBe(0);
  });

  it('deduplicates labels for a list-shaped slot', () => {
    const index = new ClaimIndex([
      claim(Dimension.SYSTEMS, 'systems_read', 'SAP'),
      claim(Dimension.SYSTEMS, 'systems_read', 'sap'),
      claim(Dimension.SYSTEMS, 'systems_read', 'the shortage tracker'),
    ]);
    expect(index.labels(Dimension.SYSTEMS, 'systems_read')).toEqual(['SAP', 'the shortage tracker']);
  });

  it('keeps the earliest spelling at equal confidence, not the latest', () => {
    // Newest-wins would be "last write wins" in disguise. A later claim that
    // genuinely disagrees becomes a flagged conflict, not a silent overwrite.
    const index = new ClaimIndex([
      claim(Dimension.SYSTEMS, 'system_of_record', 'SAP'),
      claim(Dimension.SYSTEMS, 'system_of_record', 'the shortage tracker'),
    ]);
    expect(index.text(Dimension.SYSTEMS, 'system_of_record')).toBe('SAP');
    // Both are still on record for the contradiction section to report.
    expect(index.all(Dimension.SYSTEMS, 'system_of_record')).toHaveLength(2);
  });

  it('shortens on a word boundary', () => {
    expect(shorten('the materials planner in the Coventry plant', 20)).toBe('the materials…');
    expect(shorten('short', 20)).toBe('short');
  });
});

describe('diagrams', () => {
  it('draws every diagram even with nothing in the store', () => {
    // A diagram with holes is a better prompt than a missing section.
    for (const diagram of [
      actorMapDiagram(emptyIndex),
      currentStateDiagram(emptyIndex),
      targetStateDiagram(emptyIndex),
      systemContextDiagram(emptyIndex, 'Shortage escalation'),
    ]) {
      expect(diagram.length).toBeGreaterThan(50);
      expect(countHoles(diagram)).toBeGreaterThan(0);
      expect(diagram).toContain(HOLE);
    }
  });

  it('names all five actor roles whether or not they are known', () => {
    const diagram = actorMapDiagram(populated);
    expect(diagram).toContain('The materials planner');
    expect(diagram).toContain('The plant manager');
    // The unfilled ones are visible as gaps rather than quietly absent.
    expect(diagram).toContain('who gets the result');
    expect(diagram).toContain('who picks up the mess');
  });

  it('loses holes as the store fills up', () => {
    expect(countHoles(actorMapDiagram(populated))).toBeLessThan(
      countHoles(actorMapDiagram(emptyIndex)),
    );
  });

  it('puts reads on one side and writes on the other', () => {
    const diagram = systemContextDiagram(populated, 'Shortage escalation');
    expect(diagram).toContain('the shortage tracker');
    expect(diagram).toContain('SAP');
    expect(diagram).toContain('Treated as right: SAP');
  });

  it('is byte-stable across renders of the same store', () => {
    expect(currentStateDiagram(populated)).toBe(currentStateDiagram(populated));
    expect(systemContextDiagram(populated, 'x')).toBe(systemContextDiagram(populated, 'x'));
  });

  it('never emits a bracket or quote that would break the parse', () => {
    const hostile = new ClaimIndex([
      claim(Dimension.ACTORS, 'performer', 'the "planner" [ops] {north} | plant (UK)'),
      claim(Dimension.SYSTEMS, 'systems_read', 'SAP <ECC> | tracker'),
    ]);

    for (const diagram of [
      actorMapDiagram(hostile),
      currentStateDiagram(hostile),
      systemContextDiagram(hostile, 'a|b[c]'),
    ]) {
      // Node labels are wrapped in "…"; nothing inside may reintroduce a
      // bracket or a bare quote, or the whole diagram fails to render.
      for (const inner of diagram.matchAll(/"([^"]*)"/g)) {
        expect(inner[1]).not.toMatch(/[[\]{}()<>|]/);
      }
    }
  });

  it('escapes a quote in a label rather than dropping it', () => {
    expect(label('the "Monday list"')).toBe('the &quot;Monday list&quot;');
    expect(label('')).toBe(HOLE);
    expect(label(null, 'fallback')).toBe('fallback');
  });
});

describe('the fixed template', () => {
  it('substitutes every placeholder', () => {
    expect(fill('# {{title}}\n{{body}}', { title: 'A', body: 'B' })).toBe('# A\nB');
  });

  it('refuses to emit a document with an unfilled field', () => {
    // Better a loud failure than `{{trigger}}` in a developer's handoff spec.
    expect(() => fill('{{a}} {{b}}', { a: '1' }, 'brd.md')).toThrow(MissingTemplateFieldError);
    try {
      fill('{{a}} {{b}}', { a: '1' }, 'brd.md');
    } catch (error) {
      expect((error as MissingTemplateFieldError).fields).toEqual(['b']);
    }
  });

  it('lists the fields a template expects', () => {
    expect(fieldsOf('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('escapes a pipe so a claim cannot shift every column', () => {
    expect(cell('SAP | the tracker')).toBe('SAP \\| the tracker');
    expect(cell('line one\nline two')).toBe('line one line two');
    expect(cell('   ')).toBe('—');
  });

  it('renders an empty table as a row of dashes, not as nothing', () => {
    const rendered = table(['A', 'B'], []);
    expect(rendered.split('\n')).toHaveLength(3);
    expect(rendered).toContain('| — | — |');
  });
});

describe('prose without a model', () => {
  it('names what is missing instead of writing around it', () => {
    const prose = proseFromClaims(emptyIndex, 'Shortage escalation');
    for (const field of Object.values(prose)) {
      expect(typeof field).toBe('string');
      expect(field.length).toBeGreaterThan(0);
    }
    expect(prose.systemContextNotes).toContain('not yet established');
  });

  it('punctuates claim fragments into sentences', () => {
    // Claim content is speech, not prose. Joined unpunctuated it reads as
    // "the Monday list lands not yet established — how often...".
    expect(sentence('the Monday list lands')).toBe('The Monday list lands.');
    expect(sentence('Already a sentence.')).toBe('Already a sentence.');
    expect(sentence('Ends in a question?')).toBe('Ends in a question?');
    expect(sentence('')).toBe('');
    // Markdown emphasis is left alone so the gap marker keeps its underscores.
    expect(sentence('_not yet established_ — nobody said')).toBe(
      '_not yet established_ — nobody said.',
    );
    // A proper noun must not be lower-cased or re-cased.
    expect(sentence('SAP is the record')).toBe('SAP is the record.');
  });

  it('runs sentences together nowhere in the fallback prose', () => {
    for (const field of Object.values(proseFromClaims(populated, 'Shortage escalation'))) {
      expect(field).not.toMatch(/[a-z] _not yet established_/);
    }
  });

  it('uses the customer\'s own words when it has them', () => {
    const prose = proseFromClaims(populated, 'Shortage escalation');
    expect(prose.systemContextNotes).toContain('the shortage tracker');
    expect(prose.systemContextNotes).toContain('SAP');
    expect(prose.currentStateNotes).toContain('The materials planner');
  });
});
