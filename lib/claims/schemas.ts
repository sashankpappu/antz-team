import { Confidence, Dimension } from '@prisma/client';
import { z } from 'zod';
import { ALL_SLOTS, findSlot, ONTOLOGY } from '@/lib/ontology';

/**
 * The extraction contract. Structured output, so the model cannot return prose
 * where a claim was asked for, and cannot invent a dimension.
 */

const DIMENSION_VALUES = ONTOLOGY.map((d) => d.dimension) as [Dimension, ...Dimension[]];
const SLOT_KEYS = [...new Set(ALL_SLOTS.map((s) => s.slot))] as [string, ...string[]];

export const ExtractedClaimSchema = z.object({
  dimension: z.enum(DIMENSION_VALUES),
  slot: z.enum(SLOT_KEYS),
  /** The claim itself, in the customer's own words wherever possible. */
  content: z.string().min(1),
  /**
   * Verbatim supporting quote. Empty means the claim was inferred rather than
   * stated, which forces confidence down to low — see normaliseConfidence.
   */
  quote: z.string(),
  /** Speaker as labelled in the source, or null if the source has no labels. */
  speaker: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export const VocabularyTermSchema = z.object({
  /** The customer's own word: "shortage tracker", "the Monday list", "SAP". */
  term: z.string().min(1),
  kind: z.enum(['system', 'team', 'process', 'document', 'role', 'other']),
});

export type VocabularyTerm = z.infer<typeof VocabularyTermSchema>;

export const ExtractionSchema = z.object({
  claims: z.array(ExtractedClaimSchema),
  /**
   * Domain specificity is harvested here, not authored. These are the words we
   * hand back to the exec so a question sounds like their business.
   */
  vocabulary: z.array(VocabularyTermSchema),
  /** Best guess at whose process this is, used to pick the entry order. */
  inferredRole: z.string().nullable(),
  inferredDomain: z.string().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const CONFIDENCE_MAP: Record<ExtractedClaim['confidence'], Confidence> = {
  high: Confidence.HIGH,
  medium: Confidence.MEDIUM,
  low: Confidence.LOW,
};

/**
 * A claim with no verbatim quote is an inference however sure the model
 * sounds, and an inference must never fill a slot. Downgrading here rather
 * than trusting the model's self-report is the difference between a gap we
 * still ask about and a fabricated fact in someone's handoff spec.
 */
export function normaliseConfidence(claim: ExtractedClaim): Confidence {
  const quoted = claim.quote.trim().length > 0;
  const stated = CONFIDENCE_MAP[claim.confidence];
  if (!quoted) return Confidence.LOW;
  return stated;
}

/**
 * Drop claims whose dimension/slot pair is not in the ontology. `slot` is an
 * enum of every slot key, but keys are not unique across dimensions
 * ("frequency" is both a Triggers slot and an Exceptions slot), so the pair
 * still has to be checked.
 */
export function keepValidSlots(claims: ExtractedClaim[]): {
  valid: ExtractedClaim[];
  rejected: ExtractedClaim[];
} {
  const valid: ExtractedClaim[] = [];
  const rejected: ExtractedClaim[] = [];
  for (const claim of claims) {
    if (findSlot(claim.dimension, claim.slot)) valid.push(claim);
    else rejected.push(claim);
  }
  return { valid, rejected };
}
