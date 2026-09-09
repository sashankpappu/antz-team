import { Confidence, Dimension } from '@prisma/client';
import { ONTOLOGY, type DimensionDef } from './dimensions';

/**
 * The minimum a claim must carry for its slot to count as filled. An inferred
 * claim is LOW and deliberately does not fill anything — a guess that scores
 * is worse than a gap, because it stops us asking.
 */
export const FILL_CONFIDENCE: Confidence[] = [Confidence.MEDIUM, Confidence.HIGH];

/** The shape scoring needs from a claim. Any row with these fields will do. */
export interface ScorableClaim {
  dimension: Dimension;
  slot: string;
  confidence: Confidence;
  supersededById?: string | null;
}

export function fillsSlot(claim: ScorableClaim): boolean {
  if (claim.supersededById) return false;
  return FILL_CONFIDENCE.includes(claim.confidence);
}

export interface SlotScore {
  slot: string;
  label: string;
  filled: boolean;
  /** Claims touching this slot at any confidence, filled or not. */
  claimCount: number;
  /** Claims touching it that were too weak to fill it. */
  lowConfidenceCount: number;
}

export interface DimensionScore {
  dimension: Dimension;
  label: string;
  /** The question this dimension forces, for the scorecard's Gap column. */
  forces: string;
  pct: number;
  filledSlots: number;
  totalSlots: number;
  slots: SlotScore[];
  /** Unfilled slot keys, in ontology order — the dimension's own gap list. */
  openSlots: string[];
}

export interface Scorecard {
  overallPct: number;
  dimensions: DimensionScore[];
  filledSlots: number;
  totalSlots: number;
}

function scoreDimension(def: DimensionDef, claims: ScorableClaim[]): DimensionScore {
  const relevant = claims.filter((c) => c.dimension === def.dimension);

  const slots: SlotScore[] = def.slots.map((slotDef) => {
    const forSlot = relevant.filter((c) => c.slot === slotDef.key);
    const filling = forSlot.filter(fillsSlot);
    return {
      slot: slotDef.key,
      label: slotDef.label,
      filled: filling.length > 0,
      claimCount: forSlot.length,
      lowConfidenceCount: forSlot.length - filling.length,
    };
  });

  const filledSlots = slots.filter((s) => s.filled).length;

  return {
    dimension: def.dimension,
    label: def.label,
    forces: def.forces,
    // Dimension score = filled slots / total slots.
    pct: Math.round((filledSlots / def.slots.length) * 100),
    filledSlots,
    totalSlots: def.slots.length,
    slots,
    openSlots: slots.filter((s) => !s.filled).map((s) => s.slot),
  };
}

/**
 * Score every dimension from the claim store.
 *
 * Pure and synchronous by design: it runs on the async path after a turn, and
 * keeping it free of I/O is what lets it stay out of the voice loop.
 */
export function score(claims: ScorableClaim[]): Scorecard {
  const dimensions = ONTOLOGY.map((def) => scoreDimension(def, claims));

  // Overall = mean of the dimension scores, not of the slots. Every dimension
  // matters equally however many slots it happens to have.
  const overallPct = Math.round(
    dimensions.reduce((sum, d) => sum + d.pct, 0) / dimensions.length,
  );

  return {
    overallPct,
    dimensions,
    filledSlots: dimensions.reduce((sum, d) => sum + d.filledSlots, 0),
    totalSlots: dimensions.reduce((sum, d) => sum + d.totalSlots, 0),
  };
}

/** Slots with no filling claim, as a flat list — the input to gap ranking. */
export function openSlots(scorecard: Scorecard): { dimension: Dimension; slot: string }[] {
  return scorecard.dimensions.flatMap((d) =>
    d.openSlots.map((slot) => ({ dimension: d.dimension, slot })),
  );
}

/**
 * Confidence in a slot as a 0-1 number, used by the ranking algorithm's
 * (1 - current_confidence) term. A filled slot is 1; a slot with only weak
 * evidence is 0.35, so it is still asked but after the untouched ones.
 */
export function slotConfidence(claims: ScorableClaim[], dimension: Dimension, slot: string): number {
  const forSlot = claims.filter((c) => c.dimension === dimension && c.slot === slot);
  if (forSlot.some(fillsSlot)) return 1;
  if (forSlot.length > 0) return 0.35;
  return 0;
}
