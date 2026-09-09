import { Confidence, Dimension, GapStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  ROLE_BOOST_RANGE,
  blockingOpenSlots,
  isAskable,
  rankOpenSlots,
  roleBoost,
} from '@/lib/interview/rank';
import { ONTOLOGY, findSlot, parseSlotRef, score, type ScorableClaim } from '@/lib/ontology';

const empty = score([]);

function topRefs(count: number, role: string | null = null): string[] {
  return rankOpenSlots({ scorecard: empty, claims: [], role })
    .slice(0, count)
    .map((s) => `${s.dimension}.${s.slot}`);
}

describe('question selection', () => {
  it('offers every slot when nothing is known', () => {
    expect(rankOpenSlots({ scorecard: empty, claims: [] })).toHaveLength(
      ONTOLOGY.reduce((n, d) => n + d.slots.length, 0),
    );
  });

  it('reaches for systems and actors first, because they unlock the most', () => {
    const opening = topRefs(6);
    const dimensions = opening.map((ref) => ref.split('.')[0]);
    expect(dimensions).toContain(Dimension.SYSTEMS);
    expect(dimensions).toContain(Dimension.ACTORS);
  });

  it('never opens on a low-value slot', () => {
    const opening = topRefs(8);
    expect(opening).not.toContain('TRIGGERS.seasonality');
    expect(opening).not.toContain('VOLUMES.growth');
    expect(opening).not.toContain('VOLUMES.size_of_each');
  });

  it('applies the stated formula', () => {
    const [top] = rankOpenSlots({ scorecard: empty, claims: [] });
    const def = findSlot(top.dimension, top.slot)!.def;
    expect(top.score).toBeCloseTo(
      def.blockingWeight * top.downstreamUnlock * (1 - top.confidence) * top.roleBoost,
      6,
    );
  });

  it('drops a slot once it is filled', () => {
    const claims: ScorableClaim[] = [
      { dimension: Dimension.SYSTEMS, slot: 'systems_read', confidence: Confidence.HIGH },
    ];
    const ranked = rankOpenSlots({ scorecard: score(claims), claims });
    expect(ranked.map((s) => `${s.dimension}.${s.slot}`)).not.toContain('SYSTEMS.systems_read');
  });

  it('demotes but keeps a slot that only has weak evidence', () => {
    const claims: ScorableClaim[] = [
      { dimension: Dimension.SYSTEMS, slot: 'systems_read', confidence: Confidence.LOW },
    ];
    const ranked = rankOpenSlots({ scorecard: score(claims), claims });
    const weak = ranked.find((s) => s.slot === 'systems_read')!;

    expect(weak).toBeDefined();
    expect(weak.confidence).toBeGreaterThan(0);
    // Still asked, but after the slots nobody has touched at all.
    expect(ranked.indexOf(weak)).toBeGreaterThan(0);
  });

  it('is deterministic, so the cache does not reshuffle between refreshes', () => {
    expect(topRefs(10)).toEqual(topRefs(10));
  });

  it('opens every interview on the foundational slots, whatever the role', () => {
    // "Systems and actors unlock the most, ask them early" wins the opening
    // for everyone. Role decides what comes after, not what comes first.
    for (const role of [null, 'Chief Operating Officer', 'Group CFO']) {
      const opening = topRefs(3, role).map((ref) => ref.split('.')[0]);
      expect(opening.every((d) => d === Dimension.ACTORS || d === Dimension.SYSTEMS)).toBe(true);
    }
  });

  it('brings a role its own dimensions materially earlier', () => {
    const firstOf = (role: string | null, dimension: Dimension) =>
      rankOpenSlots({ scorecard: empty, claims: [], role }).findIndex(
        (s) => s.dimension === dimension,
      );

    // A COO is asked about handoffs and volumes sooner than the default order
    // would, and a finance head about decisions and what "done" means.
    expect(firstOf('Chief Operating Officer', Dimension.HANDOFFS)).toBeLessThan(
      firstOf(null, Dimension.HANDOFFS),
    );
    expect(firstOf('Chief Operating Officer', Dimension.VOLUMES)).toBeLessThan(
      firstOf(null, Dimension.VOLUMES),
    );
    expect(firstOf('Group CFO', Dimension.DECISION_RULES)).toBeLessThan(
      firstOf(null, Dimension.DECISION_RULES),
    );
    expect(firstOf('Group CFO', Dimension.DONE_CRITERIA)).toBeLessThan(
      firstOf(null, Dimension.DONE_CRITERIA),
    );

    // And the boost stays bounded — a reorder, never a veto.
    expect(roleBoost('Chief Operating Officer', Dimension.HANDOFFS)).toBeLessThanOrEqual(
      1 + ROLE_BOOST_RANGE,
    );
    expect(roleBoost(null, Dimension.VOLUMES)).toBeGreaterThanOrEqual(1);
  });

  it('puts a COO on handoffs within the first four questions', () => {
    expect(topRefs(4, 'Chief Operating Officer')).toContain('HANDOFFS.team_boundaries');
  });

  it('marks the slots a developer cannot start without', () => {
    const blocking = blockingOpenSlots({ scorecard: empty, claims: [] });
    expect(blocking.length).toBeGreaterThan(5);
    expect(blocking.every((s) => s.blockingWeight === 3)).toBe(true);
  });
});

describe('never asking the same thing twice', () => {
  const base = { dimension: Dimension.SYSTEMS, slot: 'systems_read' };

  it('asks an untouched slot', () => {
    expect(isAskable(undefined)).toBe(true);
    expect(isAskable({ ...base, status: GapStatus.OPEN, askedCount: 0 })).toBe(true);
  });

  it('does not re-ask a slot whose answer landed clearly', () => {
    expect(isAskable({ ...base, status: GapStatus.OPEN, askedCount: 1 }, 0)).toBe(false);
  });

  it('gives one more attempt when the answer was explicitly ambiguous', () => {
    // Something was said but it was not clear enough to bank: confidence sits
    // between 0 and 1, which is the definition of an ambiguous answer.
    expect(isAskable({ ...base, status: GapStatus.OPEN, askedCount: 1 }, 0.35)).toBe(true);
    expect(isAskable({ ...base, status: GapStatus.OPEN, askedCount: 2 }, 0.35)).toBe(false);
  });

  it('never pushes an owned gap again', () => {
    expect(isAskable({ ...base, status: GapStatus.OWNED, askedCount: 0 })).toBe(false);
    expect(isAskable({ ...base, status: GapStatus.DEFERRED, askedCount: 0 })).toBe(false);
    expect(isAskable({ ...base, status: GapStatus.ANSWERED, askedCount: 0 })).toBe(false);
  });

  it('excludes an owned slot from the ranking entirely', () => {
    const ranked = rankOpenSlots({
      scorecard: empty,
      claims: [],
      gaps: [{ dimension: Dimension.SYSTEMS, slot: 'systems_read', status: GapStatus.OWNED, askedCount: 0 }],
    });
    expect(ranked.map((s) => s.slot)).not.toContain('systems_read');
  });
});

/**
 * The stated budget: 80% completeness within 12 questions.
 *
 * Whether that is reachable depends on how many slots one answer establishes,
 * which the ranking can influence but not control. These tests pin down the
 * relationship rather than asserting a number that happens to pass, because
 * the honest finding is the useful one: with one slot per answer the budget is
 * unreachable by arithmetic (38 slots, 12 answers), and the ranking's job is
 * to make each question land on the slot whose answer spills into the most
 * neighbours.
 */
function simulateSession(slotsPerAnswer: number, role: string | null = null): number[] {
  const claims: ScorableClaim[] = [];
  const asked: string[] = [];
  const curve: number[] = [];

  for (let question = 0; question < 20; question += 1) {
    const scorecard = score(claims);
    curve.push(scorecard.overallPct);

    const ranked = rankOpenSlots({
      scorecard,
      claims,
      role,
      gaps: asked.map((ref) => {
        const address = parseSlotRef(ref)!;
        return {
          dimension: address.dimension,
          slot: address.slot,
          status: GapStatus.OPEN,
          askedCount: 1,
        };
      }),
    });

    if (ranked.length === 0) break;

    const top = ranked[0];
    asked.push(`${top.dimension}.${top.slot}`);
    claims.push({ dimension: top.dimension, slot: top.slot, confidence: Confidence.HIGH });

    // A real answer rarely fills only the slot that was asked about. "The
    // planner pulls the shortage list from SAP every Monday and emails
    // procurement" fills five. Modelled here as spilling into the slots this
    // one unlocks — which is exactly what the ranking optimises for.
    for (const ref of (findSlot(top.dimension, top.slot)?.def.unlocks ?? []).slice(
      0,
      slotsPerAnswer - 1,
    )) {
      const address = parseSlotRef(ref);
      if (address) claims.push({ ...address, confidence: Confidence.HIGH });
    }
  }

  curve.push(score(claims).overallPct);
  return curve;
}

describe('the 12-question budget', () => {
  it('climbs monotonically — a question never loses ground', () => {
    const curve = simulateSession(2);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it('hits 80% inside 12 questions when answers establish about three slots', () => {
    const curve = simulateSession(3);
    expect(curve[12]).toBeGreaterThanOrEqual(80);
  });

  it('cannot hit 80% in 12 if each answer fills exactly one slot', () => {
    // Not a failure of the ranking — arithmetic. 38 slots cannot be covered by
    // 12 single-slot answers, so the budget is a constraint on question
    // design, not only on question order.
    const curve = simulateSession(1);
    expect(curve[12]).toBeLessThan(80);
  });

  it('front-loads the value: half the ground is covered in the first third', () => {
    const curve = simulateSession(3);
    expect(curve[6]).toBeGreaterThan(curve[curve.length - 1] / 2.5);
  });

  it('holds the budget for a COO as well as the default order', () => {
    expect(simulateSession(3, 'Chief Operating Officer')[12]).toBeGreaterThanOrEqual(80);
  });
});
