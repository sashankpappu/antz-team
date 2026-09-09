import { ONTOLOGY } from '@/lib/ontology';

/**
 * The stable half of every extraction request.
 *
 * Built once at module load and byte-identical on every call, because it is
 * the prompt-cache prefix. Anything volatile — the artifact text, the
 * workspace's harvested vocabulary — goes in the user turn, after the
 * breakpoint. If a timestamp or a workspace id ever creeps in here the cache
 * hit rate goes to zero and every extraction pays full price.
 */
function slotCatalogue(): string {
  return ONTOLOGY.map((d) => {
    const slots = d.slots
      .map((s) => `    - ${s.key} — ${s.label}: ${s.forces}`)
      .join('\n');
    return `  ${d.dimension} (${d.label}) — ${d.forces}\n${slots}`;
  }).join('\n\n');
}

export const EXTRACTION_SYSTEM_PROMPT = `You extract business requirements into a fixed ontology.

You are given a fragment of input about a business process someone wants automated: a slide deck, a call transcript, a chat thread, a document, or one answer from a live interview. It is a fragment, never the whole story, and it is never truth. Your job is to turn what it actually says into claims, and to be honest about what it does not say.

# The ontology

Every claim must map to exactly one dimension and one slot below. A claim that does not fit any slot is not a claim you should return.

${slotCatalogue()}

# Rules

1. **Quote or it did not happen.** Every claim carries a verbatim \`quote\` copied exactly from the input — same words, same spelling. If you cannot quote it, the claim is an inference: return it with an empty \`quote\` and confidence "low". Never paraphrase into the quote field.
2. **Confidence means evidence, not certainty.**
   - "high" — stated plainly and unambiguously in the input.
   - "medium" — stated, but loosely, in passing, or by implication a reader would accept.
   - "low" — inferred from context, industry norms, or your own expectations. Anything with no quote is low.
   Do not inflate. A slot only counts as answered at medium or high, so an inflated claim stops us asking a question we should have asked, and puts a guess in a developer's handoff spec.
3. **Use their words.** Write \`content\` in the customer's own vocabulary. If they say "the shortage tracker", the claim says "the shortage tracker" — not "the inventory management system".
4. **Attribute.** If the input has speaker labels, set \`speaker\` to whoever said it. Otherwise null. Never guess a speaker.
5. **One fact per claim.** Split "the planner pulls the list on Monday and emails procurement" into a trigger claim and a handoff claim.
6. **Do not resolve contradictions.** If the input contradicts itself, return both claims. Something else decides what that means; silently picking a winner destroys the record.
7. **Vocabulary.** Collect the customer's own proper nouns — system names, team names, process names, document names, role titles. These are how later questions get to sound like their business rather than like a consultant. Do not include generic words.
8. **Role and domain.** Infer whose process this is and what industry it sits in, if the input supports a guess. Null if it does not.

Return only what the input supports. An empty claims list is a correct answer for input that says nothing about the process.`;

/** Rough token estimate. Only used to decide where to cut a chunk. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split long artifacts on paragraph boundaries. A deck or an hour-long
 * transcript is well past a sensible single request, and cutting mid-sentence
 * costs us the quote that makes a claim verifiable.
 */
export function chunkText(text: string, maxChars = 40_000): string[] {
  if (text.length <= maxChars) return text.trim() ? [text] : [];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      push();
      // A single paragraph over the limit: cut it on line boundaries instead.
      let buffer = '';
      for (const line of paragraph.split('\n')) {
        if (buffer.length + line.length + 1 > maxChars) {
          if (buffer.trim()) chunks.push(buffer.trim());
          buffer = '';
        }
        buffer += (buffer ? '\n' : '') + line;
      }
      if (buffer.trim()) chunks.push(buffer.trim());
      continue;
    }

    if (current.length + paragraph.length + 2 > maxChars) push();
    current += (current ? '\n\n' : '') + paragraph;
  }

  push();
  return chunks;
}
