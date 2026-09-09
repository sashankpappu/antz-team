import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Dimension } from '@prisma/client';
import { z } from 'zod';
import { MODEL, anthropic, isModelConfigured } from '@/lib/anthropic';
import { ClaimIndex } from './claim-index';
import { UNKNOWN } from './template';

/**
 * The only place the model writes into a render, and it writes named fields —
 * never sections, never structure. The template owns the document; this fills
 * five blanks in it.
 *
 * Every field is grounded in claims that are passed in. A field with nothing
 * behind it comes back as an explicit statement that it is not established,
 * which is why the schema has no optional strings.
 */

const ProseSchema = z.object({
  /** 2-4 sentences. What hurts today and what it costs. */
  problem: z.string(),
  /** 1-3 sentences. What starts the work, and how often. */
  trigger: z.string(),
  /** 2-4 sentences on how it runs today, naming their systems and people. */
  currentStateNotes: z.string(),
  /** 2-4 sentences on what changes, without naming any technology. */
  targetStateNotes: z.string(),
  /** 1-3 sentences on which systems are involved and which one wins. */
  systemContextNotes: z.string(),
});

export type Prose = z.infer<typeof ProseSchema>;

const PROSE_SYSTEM_PROMPT = `You write short factual passages for a business requirements document, from a list of established claims.

The document goes to a developer who has never spoken to anyone at this customer and has no tribal knowledge. Everything they need must be on the page, and nothing on the page may be something you made up.

# Rules

1. **Only what the claims say.** Never add a fact, a cause, a number, a system name or a benefit that is not in the claims given to you. If the claims do not support a passage, say plainly what is not yet established instead of writing around it.
2. **Their words.** Use the customer's own names for systems, teams and documents exactly as the claims spell them.
3. **No technology.** Never name a vendor, language, framework, database, cloud or product that the claims do not name. No recommendations.
4. **No estimates.** Never say how long something would take, what it would cost, how hard it would be, or whether it is feasible. That is not this document's job.
5. **Flat and factual.** No selling, no "exciting opportunity", no "leveraging". Short sentences. A developer is reading this to build, not to be persuaded.
6. **Do not hedge what is known and do not assert what is not.** A claim marked as established is a fact you can state flatly. Anything else is a gap you name as a gap.
7. **Length.** Each field is a short paragraph. Never a bulleted list, never a heading — the document supplies those.`;

/** The claim lines the model is allowed to draw on, grouped by dimension. */
function evidence(index: ClaimIndex): string {
  const groups: string[] = [];

  for (const dimension of Object.values(Dimension)) {
    const claims = index.claims.filter(
      (c) => c.dimension === dimension && !c.supersededById,
    );
    if (claims.length === 0) continue;

    const lines = claims.map((c) => {
      const strength = c.confidence === 'LOW' ? 'UNVERIFIED GUESS' : 'established';
      const who = c.speaker ? `, said by ${c.speaker}` : '';
      return `  - [${c.slot}] ${c.content} (${strength}${who})`;
    });

    groups.push(`${dimension}:\n${lines.join('\n')}`);
  }

  return groups.length > 0 ? groups.join('\n\n') : '(no claims recorded yet)';
}

function openSlotSummary(index: ClaimIndex, openSlots: { dimension: Dimension; slot: string }[]): string {
  if (openSlots.length === 0) return '(nothing open)';
  return openSlots.map((s) => `  - ${s.dimension}.${s.slot}`).join('\n');
}

/**
 * Deterministic fallback. Used when no API key is configured or generation
 * fails, so a render never breaks and never invents: each field is assembled
 * from the claims themselves, or names itself as not yet established.
 */
export function proseFromClaims(index: ClaimIndex, processName: string): Prose {
  const or = (value: string | null, whatIsMissing: string) =>
    value ?? `${UNKNOWN} — ${whatIsMissing}`;

  // Claim content is a fragment of someone's speech, not a sentence, so it
  // arrives without a full stop. Joining fragments straight together produces
  // "the Monday list lands not yet established — how often..." in a document
  // that goes to a developer.
  const join = (...parts: (string | null)[]) =>
    parts.filter((part): part is string => Boolean(part?.trim())).map(sentence).join(' ');

  const trigger = index.text(Dimension.TRIGGERS, 'what_starts_it');
  const frequency = index.text(Dimension.TRIGGERS, 'frequency');
  const performer = index.text(Dimension.ACTORS, 'performer');
  const reads = index.labels(Dimension.SYSTEMS, 'systems_read', 3);
  const writes = index.labels(Dimension.SYSTEMS, 'systems_written', 3);
  const sor = index.text(Dimension.SYSTEMS, 'system_of_record');
  const failure = index.text(Dimension.EXCEPTIONS, 'known_failure_modes');
  const success = index.text(Dimension.DONE_CRITERIA, 'success_definition');
  const logic = index.text(Dimension.DECISION_RULES, 'logic');

  return {
    problem: join(
      or(failure, 'nobody has stated what goes wrong today'),
      success
        ? `Working would mean: ${success}`
        : `${UNKNOWN} — what "working" means has not been stated`,
    ),

    trigger: join(
      or(trigger, 'what sets this off has not been stated'),
      frequency ? `It happens ${frequency}` : `${UNKNOWN} — how often has not been stated`,
    ),

    currentStateNotes: join(
      performer ? `Done today by ${performer}` : `${UNKNOWN} — who does the work today`,
      logic ? `The call is made by: ${logic}` : `${UNKNOWN} — how the decision is made`,
    ),

    targetStateNotes:
      `The target state below is assembled from the claims on record for ${processName}. ` +
      `Steps drawn with a ? are not yet decided and must not be read as agreed.`,

    systemContextNotes: join(
      reads.length ? `Read from: ${reads.join(', ')}` : `${UNKNOWN} — which systems are read`,
      writes.length
        ? `Written to: ${writes.join(', ')}`
        : `${UNKNOWN} — which systems are written`,
      sor
        ? `Treated as authoritative: ${sor}`
        : `${UNKNOWN} — which system wins when they disagree`,
    ),
  };
}

/**
 * Turn a claim fragment into a sentence: terminal punctuation, and a capital
 * where the fragment starts with a letter. Leaves markdown emphasis alone, so
 * the "not yet established" marker keeps its underscores.
 */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const punctuated = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return punctuated.replace(/^\p{Ll}/u, (first) => first.toUpperCase());
}

export async function generateProse(
  index: ClaimIndex,
  processName: string,
  openSlots: { dimension: Dimension; slot: string }[],
): Promise<Prose> {
  if (!isModelConfigured() || index.claimCount === 0) {
    return proseFromClaims(index, processName);
  }

  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4_000,
      system: [
        {
          type: 'text',
          text: PROSE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            `Process: ${processName}\n\n` +
            `Established claims and unverified guesses:\n${evidence(index)}\n\n` +
            `Still open, so must not be written as decided:\n${openSlotSummary(index, openSlots)}`,
        },
      ],
      output_format: betaZodOutputFormat(ProseSchema),
    });

    return response.parsed_output ?? proseFromClaims(index, processName);
  } catch {
    return proseFromClaims(index, processName);
  }
}

const SummarySchema = z.object({
  /** The idea played back in their words, for correction. */
  summary: z.string(),
});

const SUMMARY_SYSTEM_PROMPT = `You play a business idea back to the executive who described it, so they can correct you.

Write it as you understood it, in their own words, in plain prose. Second person: "You want to...". Six sentences at most.

Rules:
1. Only what they actually told you. Nothing added, nothing smoothed over.
2. Where you are guessing, say so in the sentence: "I've assumed X — correct me."
3. Where something important is missing, say it is missing. Do not paper over it.
4. No jargon, no headings, no bullets, no flattery, no summary of your own process.

They are checking one thing: did this thing understand me. Make that easy to answer.`;

/** /summary — the idea played back for correction. */
export async function generateSummary(index: ClaimIndex, processName: string): Promise<string> {
  if (!isModelConfigured() || index.claimCount === 0) {
    const prose = proseFromClaims(index, processName);
    return `${prose.trigger} ${prose.currentStateNotes} ${prose.problem}`;
  }

  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 2_000,
      system: [
        {
          type: 'text',
          text: SUMMARY_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: `Process: ${processName}\n\nWhat they told you:\n${evidence(index)}` },
      ],
      output_format: betaZodOutputFormat(SummarySchema),
    });

    return response.parsed_output?.summary ?? proseFromClaims(index, processName).problem;
  } catch {
    return proseFromClaims(index, processName).problem;
  }
}
