import { Dimension, GapStatus } from '@prisma/client';
import {
  downstreamUnlock,
  entryOrderForRole,
  findSlot,
  openSlots,
  slotConfidence,
  type ScorableClaim,
  type Scorecard,
} from '@/lib/ontology';

/**
 * Question selection. This is the product.
 *
 * The next question is always the highest-value open slot — never a free-form
 * "what else should I ask?". Every question traces back to a slot, which is
 * what makes the completeness gauge mean anything and what stops the
 * interviewer wandering.
 */

export interface GapState {
  dimension: Dimension;
  slot: string;
  status: GapStatus;
  askedCount: number;
}

export interface RankedSlot {
  dimension: Dimension;
  slot: string;
  /** blocking_weight × downstream_unlock × (1 - confidence) × role_boost */
  score: number;
  blockingWeight: number;
  downstreamUnlock: number;
  confidence: number;
  roleBoost: number;
  /** Why this slot ranked where it did. Shown in /gaps, logged for review. */
  reason: string;
}

export interface RankInput {
  scorecard: Scorecard;
  claims: ScorableClaim[];
  gaps?: GapState[];
  /** Inferred from the seeded artifacts and the exec's first two turns. */
  role?: string | null;
}

/**
 * How much the role's entry order is allowed to move a dimension. At 1.0 the
 * boost ranges over 1x-2x, which is calibrated rather than arbitrary: it is
 * enough to pull a COO's handoffs questions several places forward, and not
 * enough to let any of them past the foundational slots.
 *
 * The build spec asks for two things that pull against each other — "Systems
 * and actors unlock the most, ask them early" and "a COO gets asked about
 * handoffs and volumes". They cannot both win the first question. The
 * multiplicative form resolves it deliberately: the foundational slots always
 * open the interview, and the role decides the order from there.
 */
export const ROLE_BOOST_RANGE = 1.0;

export function roleBoost(role: string | null | undefined, dimension: Dimension): number {
  const order = entryOrderForRole(role);
  const index = order.indexOf(dimension);
  if (index === -1) return 1;
  const position = index / Math.max(order.length - 1, 1);
  return 1 + ROLE_BOOST_RANGE * (1 - position);
}

/** The most times one slot may be asked about, even when answers stay vague. */
export const MAX_ASKS_PER_SLOT = 2;

/**
 * A slot is askable unless we have already dealt with it. "I don't know — ask
 * Ravi" produces an OWNED gap, and an owned gap is closed for this session:
 * never push twice.
 *
 * `confidence` is the slot's current confidence from the claim store, and it
 * is how "unless the answer was explicitly ambiguous" gets decided without a
 * flag anyone has to remember to set. A slot at 0 was never answered. A slot
 * between 0 and 1 was answered in words that were not clear enough to bank —
 * an ambiguous answer — and earns exactly one more attempt.
 */
export function isAskable(gap: GapState | undefined, confidence = 0): boolean {
  if (!gap) return true;
  if (gap.status === GapStatus.ANSWERED) return false;
  if (gap.status === GapStatus.OWNED) return false;
  if (gap.status === GapStatus.DEFERRED) return false;

  const answeredAmbiguously = confidence > 0 && confidence < 1;
  const allowance = answeredAmbiguously ? MAX_ASKS_PER_SLOT : 1;
  return gap.askedCount < allowance;
}

export function rankOpenSlots(input: RankInput): RankedSlot[] {
  const gapsByRef = new Map<string, GapState>(
    (input.gaps ?? []).map((g) => [`${g.dimension}.${g.slot}`, g]),
  );

  const ranked: RankedSlot[] = [];

  for (const { dimension, slot } of openSlots(input.scorecard)) {
    const def = findSlot(dimension, slot)?.def;
    if (!def) continue;

    const confidence = slotConfidence(input.claims, dimension, slot);
    if (!isAskable(gapsByRef.get(`${dimension}.${slot}`), confidence)) continue;

    const unlock = downstreamUnlock(dimension, slot);
    const boost = roleBoost(input.role, dimension);
    const score = def.blockingWeight * unlock * (1 - confidence) * boost;

    ranked.push({
      dimension,
      slot,
      score,
      blockingWeight: def.blockingWeight,
      downstreamUnlock: unlock,
      confidence,
      roleBoost: boost,
      reason:
        `blocking ${def.blockingWeight} × unlocks ${unlock} × ` +
        `(1 - confidence ${confidence.toFixed(2)}) × role ${boost.toFixed(2)}`,
    });
  }

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable tie-break so the cache does not reshuffle between refreshes.
    if (a.dimension !== b.dimension) return a.dimension.localeCompare(b.dimension);
    return a.slot.localeCompare(b.slot);
  });
}

/**
 * How many slots this one would make askable that are not askable yet. Used by
 * /gaps to explain why a question is being asked now rather than later.
 */
export function unlockedBy(dimension: Dimension, slot: string): string[] {
  return findSlot(dimension, slot)?.def.unlocks ?? [];
}

/** Slots a developer cannot proceed without: blocking weight 3, still open. */
export function blockingOpenSlots(input: RankInput): RankedSlot[] {
  return rankOpenSlots(input).filter((s) => s.blockingWeight === 3);
}
