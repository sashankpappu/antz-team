import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Confidence, Dimension } from '@prisma/client';
import { z } from 'zod';
import { MODEL, anthropic } from '@/lib/anthropic';
import { findSlot } from '@/lib/ontology';
import type { VocabularyTerm } from '@/lib/claims/schemas';
import type { RankedSlot } from './rank';

/**
 * Question generation.
 *
 * The ranking decided what to ask about. This decides how to ask it, and the
 * rules below are not style preferences — an exec who is asked a cold
 * consultant's question, or asked about something that is already in their own
 * deck, stops trusting the session and closes the tab.
 */

export const QUESTION_SYSTEM_PROMPT = `You write one question at a time for a business executive explaining a process they want automated.

They are senior, not technical, and impatient. They will quit if you waste their time.

# Rules

1. **One question per turn.** Never stack two questions. No "and also". No parenthetical second question.
2. **Ground it in something they already said.** Refer to their own words, their own systems, their own people. "You mentioned the planner gets the shortage list on Monday — is that a report someone runs, or does it land automatically?" Never a cold "what triggers this process?".
3. **Prefer a hypothesis over an open question.** Guess, and let them correct you. Correcting takes a second; explaining from scratch takes thirty. Draw the guess from their artifacts, their industry, and normal practice. "I'd guess procurement picks that up — is that right?" beats "who picks that up?".
4. **Never ask what you already know.** You are given what is already established. Asking about something in their own deck destroys trust instantly. If a fact is listed as already known, do not ask for it — at most confirm a listed guess.
5. **Business language only.** Never say: system of record, actor, SLA, integration, schema, entity, trigger, workflow, orchestration, data model, API, ontology, slot, dimension. Say "where does it actually live", "who signs off", "how long before someone chases it", "what sets it off".
6. **Short.** One or two sentences. No preamble, no "great question", no explaining why you are asking.
7. **Their vocabulary.** Use the customer's own names for things. "Does that go into SAP or stay in the shortage tracker?" beats "what is the system of record?".
8. **Never ask for permission to ask.** No "can I ask about...". Just ask.

You will be given several aspects to write a question for. Write one question for each, independently — they are cached and asked one at a time, so no question may refer to another or assume it was already answered.`;

const GeneratedQuestionSchema = z.object({
  /** Echoed back so a question can be matched to the slot it came from. */
  ref: z.string(),
  question: z.string().min(1),
});

const QuestionBatchSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
});

export interface KnownClaim {
  dimension: Dimension;
  slot: string;
  content: string;
  speaker: string | null;
  confidence: Confidence;
}

export interface QuestionContext {
  role: string | null;
  domain: string | null;
  vocabulary: VocabularyTerm[];
  claims: KnownClaim[];
  /** The last few turns, so a question does not repeat the previous one. */
  recentTurns: { role: 'USER' | 'ASSISTANT'; content: string }[];
  /** Names already nominated to answer something, so we do not re-nominate. */
  ownedGaps: { slot: string; ownerName: string | null }[];
}

export interface GeneratedQuestion {
  dimension: Dimension;
  slot: string;
  question: string;
}

function contextBlock(context: QuestionContext): string {
  const parts: string[] = [];

  if (context.role || context.domain) {
    parts.push(
      `Who you are talking to: ${context.role ?? 'unknown role'}` +
        (context.domain ? `, in ${context.domain}` : ''),
    );
  }

  if (context.vocabulary.length) {
    parts.push(
      `Their words for things — use these:\n` +
        context.vocabulary.map((v) => `- ${v.term} (${v.kind})`).join('\n'),
    );
  }

  const established = context.claims.filter(
    (c) => c.confidence === Confidence.HIGH || c.confidence === Confidence.MEDIUM,
  );
  const guesses = context.claims.filter((c) => c.confidence === Confidence.LOW);

  if (established.length) {
    parts.push(
      `ALREADY KNOWN — do not ask about any of this:\n` +
        established
          .map(
            (c) =>
              `- [${c.dimension}.${c.slot}] ${c.content}` +
              (c.speaker ? ` — ${c.speaker}` : ''),
          )
          .join('\n'),
    );
  }

  if (guesses.length) {
    parts.push(
      `UNVERIFIED GUESSES — these are inferences, not facts. Good material for a ` +
        `hypothesis to put to them for correction:\n` +
        guesses.map((c) => `- [${c.dimension}.${c.slot}] ${c.content}`).join('\n'),
    );
  }

  if (context.ownedGaps.length) {
    parts.push(
      `Already handed to someone else — do not ask again:\n` +
        context.ownedGaps
          .map((g) => `- ${g.slot} → ${g.ownerName ?? 'a named colleague'}`)
          .join('\n'),
    );
  }

  if (context.recentTurns.length) {
    parts.push(
      `Last few turns, most recent last:\n` +
        context.recentTurns
          .map((t) => `${t.role === 'USER' ? 'Them' : 'You'}: ${t.content}`)
          .join('\n'),
    );
  }

  return parts.join('\n\n');
}

function slotBlock(slots: RankedSlot[]): string {
  return slots
    .map((s) => {
      const def = findSlot(s.dimension, s.slot)?.def;
      return (
        `- ref: ${s.dimension}.${s.slot}\n` +
        `  what you need to find out: ${def?.label ?? s.slot}\n` +
        `  the underlying question: ${def?.forces ?? ''}`
      );
    })
    .join('\n');
}

/**
 * Generate a question for each of the top-ranked slots in one call.
 *
 * Batched on purpose: this fills the gap cache, and the cache is what lets the
 * interviewer answer a turn without a model call on the critical path. The
 * exec is still only ever asked one of them at a time.
 */
export async function generateQuestions(
  slots: RankedSlot[],
  context: QuestionContext,
): Promise<GeneratedQuestion[]> {
  if (slots.length === 0) return [];

  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4_000,
    system: [
      {
        type: 'text',
        text: QUESTION_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `${contextBlock(context)}\n\n` +
          `Write one question for each of these aspects:\n${slotBlock(slots)}`,
      },
    ],
    output_format: betaZodOutputFormat(QuestionBatchSchema),
  });

  const parsed = response.parsed_output;
  if (!parsed) return slots.map(fallbackQuestion);

  const byRef = new Map(parsed.questions.map((q) => [q.ref, q.question.trim()]));

  return slots.map((slot) => {
    const generated = byRef.get(`${slot.dimension}.${slot.slot}`);
    if (!generated) return fallbackQuestion(slot);
    return { dimension: slot.dimension, slot: slot.slot, question: generated };
  });
}

/**
 * The ontology's own business-language phrasing, used when generation fails or
 * is unavailable. Colder than a generated question but never wrong, and it
 * keeps the interview moving rather than showing the exec an error.
 */
export function fallbackQuestion(slot: RankedSlot): GeneratedQuestion {
  const def = findSlot(slot.dimension, slot.slot)?.def;
  return {
    dimension: slot.dimension,
    slot: slot.slot,
    question: def?.forces ?? 'Tell me a little more about how this works today.',
  };
}
