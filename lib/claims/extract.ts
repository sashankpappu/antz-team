import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ArtifactKind } from '@prisma/client';
import { MODEL, anthropic } from '@/lib/anthropic';
import type { VocabularyTerm } from './schemas';
import { ExtractionSchema, keepValidSlots, type Extraction, type ExtractedClaim } from './schemas';
import { EXTRACTION_SYSTEM_PROMPT, chunkText } from './prompt';

export interface ExtractionInput {
  /** The text to extract from. */
  text: string;
  kind: ArtifactKind;
  /** Filename or "live answer", used only to orient the model. */
  label: string;
  /** Vocabulary already harvested for this workspace, so terms stay stable. */
  knownVocabulary?: VocabularyTerm[];
  /** When extracting an answer, the slot the exec was asked about. */
  askedAbout?: { dimension: string; slot: string; question: string };
}

export interface ExtractionResult extends Extraction {
  /** Claims the model returned against a dimension/slot pair that is not real. */
  rejectedClaims: ExtractedClaim[];
  chunks: number;
}

const KIND_HINT: Record<ArtifactKind, string> = {
  [ArtifactKind.DECK]: 'a slide deck the customer already produced',
  [ArtifactKind.TRANSCRIPT]: 'a transcript of a call, with speaker labels',
  [ArtifactKind.DOC]: 'a document the customer already produced',
  [ArtifactKind.CHAT]: 'a chat or email thread, with speaker labels',
  [ArtifactKind.AUDIO]: 'a transcribed recording, with speaker labels',
};

function userTurn(input: ExtractionInput, chunk: string, part: string): string {
  const parts: string[] = [];

  if (input.knownVocabulary?.length) {
    parts.push(
      `Terms already collected for this customer (prefer these spellings):\n` +
        input.knownVocabulary.map((v) => `- ${v.term} (${v.kind})`).join('\n'),
    );
  }

  if (input.askedAbout) {
    parts.push(
      `This is the answer to a question we asked about ` +
        `${input.askedAbout.dimension}.${input.askedAbout.slot}.\n` +
        `We asked: "${input.askedAbout.question}"\n` +
        `Extract what the answer actually establishes. If the answer dodged, ` +
        `deflected, or said they do not know, return no claim for that slot — ` +
        `a non-answer is not a low-confidence answer, it is silence.`,
    );
  }

  parts.push(`Input is ${KIND_HINT[input.kind]}${part}, called "${input.label}".`);
  parts.push('---\n' + chunk + '\n---');

  return parts.join('\n\n');
}

/**
 * Extract claims from one artifact or one answer.
 *
 * Runs off the interview's critical path: for artifacts it happens at seed
 * time, and for answers it happens after the turn has already been responded
 * to. Nothing here is allowed to block the interviewer.
 */
export async function extractClaims(input: ExtractionInput): Promise<ExtractionResult> {
  const chunks = chunkText(input.text);

  if (chunks.length === 0) {
    return {
      claims: [],
      vocabulary: [],
      inferredRole: null,
      inferredDomain: null,
      rejectedClaims: [],
      chunks: 0,
    };
  }

  const client = anthropic();
  const merged: ExtractionResult = {
    claims: [],
    vocabulary: [],
    inferredRole: null,
    inferredDomain: null,
    rejectedClaims: [],
    chunks: chunks.length,
  };

  for (const [index, chunk] of chunks.entries()) {
    const part = chunks.length > 1 ? ` (part ${index + 1} of ${chunks.length})` : '';

    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      // Cached prefix: the system prompt is identical on every extraction in
      // the process, so a workspace with a deck and a transcript pays for the
      // ontology catalogue once.
      system: [
        {
          type: 'text',
          text: EXTRACTION_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userTurn(input, chunk, part) }],
      output_format: betaZodOutputFormat(ExtractionSchema),
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Extraction returned no parseable output for "${input.label}"${part} ` +
          `(stop_reason: ${response.stop_reason}).`,
      );
    }

    const { valid, rejected } = keepValidSlots(parsed.claims);
    merged.claims.push(...valid);
    merged.rejectedClaims.push(...rejected);
    merged.vocabulary.push(...parsed.vocabulary);
    merged.inferredRole ??= parsed.inferredRole;
    merged.inferredDomain ??= parsed.inferredDomain;
  }

  merged.vocabulary = dedupeVocabulary(merged.vocabulary);
  return merged;
}

export function dedupeVocabulary(terms: VocabularyTerm[]): VocabularyTerm[] {
  const byKey = new Map<string, VocabularyTerm>();
  for (const term of terms) {
    const key = term.term.trim().toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { ...term, term: term.term.trim() });
  }
  return [...byKey.values()];
}
