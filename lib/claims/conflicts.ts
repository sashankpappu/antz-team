import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Confidence, Dimension } from '@prisma/client';
import { z } from 'zod';
import { MODEL, anthropic } from '@/lib/anthropic';

/**
 * Contradiction raises a flag; it never overwrites.
 *
 * Both claims survive, the conflict is recorded against them, and the render
 * shows it. Silently letting the newer statement win is a data-loss bug: the
 * deck and the exec disagreeing about which system is authoritative is exactly
 * the finding a developer needs, and it is the finding a "last write wins"
 * store destroys.
 */

export interface ComparableClaim {
  id: string;
  dimension: Dimension;
  slot: string;
  content: string;
  speaker: string | null;
  confidence: Confidence;
  supersededById?: string | null;
}

export interface ConflictCandidate {
  a: ComparableClaim;
  b: ComparableClaim;
}

/** Only claims that actually fill a slot can contradict each other. */
function carriesWeight(claim: ComparableClaim): boolean {
  return (
    !claim.supersededById &&
    (claim.confidence === Confidence.HIGH || claim.confidence === Confidence.MEDIUM)
  );
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Two claims saying the same thing in different words are not a conflict, and
 * asking a model about them wastes a call per pair. Jaccard over word sets is
 * enough to catch the obvious restatements.
 */
export function nearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  const wordsA = new Set(normalise(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalise(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared += 1;

  const union = wordsA.size + wordsB.size - shared;
  return shared / union >= threshold;
}

/**
 * Pairs worth adjudicating: same slot, both load-bearing, not restatements of
 * each other. Pure and cheap, so it runs before any model call.
 */
export function candidatePairs(
  existing: ComparableClaim[],
  incoming: ComparableClaim[],
  options: { max?: number } = {},
): ConflictCandidate[] {
  const max = options.max ?? 24;
  const pairs: ConflictCandidate[] = [];
  const seen = new Set<string>();

  const relevantExisting = existing.filter(carriesWeight);

  for (const candidate of incoming) {
    if (!carriesWeight(candidate)) continue;

    for (const prior of relevantExisting) {
      if (prior.id === candidate.id) continue;
      if (prior.dimension !== candidate.dimension || prior.slot !== candidate.slot) continue;
      if (nearDuplicate(prior.content, candidate.content)) continue;

      const key = [prior.id, candidate.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({ a: prior, b: candidate });
      if (pairs.length >= max) return pairs;
    }
  }

  return pairs;
}

const VerdictSchema = z.object({
  contradicts: z.boolean(),
  /** One sentence, business language, shown to a human who may disagree. */
  rationale: z.string(),
});

const ADJUDICATION_SYSTEM_PROMPT = `You decide whether two statements about the same aspect of a business process actually contradict each other.

They came from different sources — a deck, a call, an interview answer — and may have different speakers. Both are already recorded and neither will be deleted. Your only job is to say whether a reader would have to pick one.

Answer true only for a real conflict: the two cannot both be true of the same process at the same time. For example "approval is automatic" against "the finance manager signs off every one".

Answer false when they are compatible: different levels of detail, different parts of the process, different steps, one general and one specific, or two things that are both true at once. Two systems both being written to is not a conflict. A process having changed over time is not a conflict unless the statements are about the same period.

Give a one-sentence rationale in plain business language. No jargon.`;

/**
 * Ask the model whether a candidate pair really contradicts.
 *
 * Deliberately one pair per call: the verdict has to be defensible on its own
 * because it surfaces in the BRD, and batching invites the model to smooth
 * several borderline pairs into one confident-sounding answer.
 */
export async function adjudicate(
  candidate: ConflictCandidate,
): Promise<{ contradicts: boolean; rationale: string }> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 1_000,
    system: [
      {
        type: 'text',
        text: ADJUDICATION_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `Aspect: ${candidate.a.dimension}.${candidate.a.slot}\n\n` +
          `Statement A${candidate.a.speaker ? ` (${candidate.a.speaker})` : ''}: ${candidate.a.content}\n\n` +
          `Statement B${candidate.b.speaker ? ` (${candidate.b.speaker})` : ''}: ${candidate.b.content}`,
      },
    ],
    // A yes/no with a one-line rationale does not need deep reasoning, and
    // this runs once per candidate pair.
    output_config: { effort: 'low' },
    output_format: betaZodOutputFormat(VerdictSchema),
  });

  const parsed = response.parsed_output;
  if (!parsed) return { contradicts: false, rationale: '' };
  return parsed;
}
