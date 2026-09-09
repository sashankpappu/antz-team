/**
 * Transcript and chat normalisation.
 *
 * Speaker labels are preserved deliberately: Claim.speaker is what lets a
 * developer see that "approval is automatic" came from the sponsor rather than
 * the person who actually does the work, and it is how a conflict between two
 * people in the same meeting gets resolved.
 */

export interface TranscriptLine {
  speaker: string | null;
  text: string;
}

/** WEBVTT / SRT cue timings and numbering, which carry no meaning for us. */
const CUE_TIMING = /^\s*(\d+:)?\d{1,2}:\d{2}([.,]\d{1,3})?\s*-->\s*(\d+:)?\d{1,2}:\d{2}([.,]\d{1,3})?/;
const CUE_INDEX = /^\s*\d+\s*$/;
const VTT_HEADER = /^\s*(WEBVTT|NOTE\b|STYLE\b|REGION\b)/i;

/**
 * A leading speaker label: "Ravi:", "Ravi Kumar (IT):", "[10:04] Ravi:",
 * "Ravi Kumar | Antz:". Deliberately conservative — a false positive would
 * attribute a claim to a speaker who never said it.
 */
const SPEAKER_LABEL = /^\s*(?:\[[^\]]{0,40}\]\s*|\(\d{1,2}:\d{2}(?::\d{2})?\)\s*|\d{1,2}:\d{2}(?::\d{2})?\s+)?([\p{L}][\p{L}\p{M}.'’-]*(?:\s+[\p{L}][\p{L}\p{M}.'’-]*){0,3}(?:\s*[\(|][^):|]{0,40}[\)]?)?)\s*:\s{1,}(.*)$/u;

export function parseTranscript(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let currentSpeaker: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CUE_TIMING.test(line) || CUE_INDEX.test(line) || VTT_HEADER.test(line)) continue;

    const match = SPEAKER_LABEL.exec(line);
    if (match) {
      const speaker = match[1].trim().replace(/\s*[|(]\s*/, ' (');
      const text = match[2].trim();
      currentSpeaker = speaker;
      if (text) lines.push({ speaker, text });
      continue;
    }

    // A continuation line belongs to whoever was last speaking.
    if (lines.length > 0 && lines[lines.length - 1].speaker === currentSpeaker) {
      lines[lines.length - 1].text += ` ${line}`;
    } else {
      lines.push({ speaker: currentSpeaker, text: line });
    }
  }

  return lines;
}

/** Distinct speakers, in first-appearance order. */
export function speakersIn(lines: TranscriptLine[]): string[] {
  const seen: string[] = [];
  for (const line of lines) {
    if (line.speaker && !seen.includes(line.speaker)) seen.push(line.speaker);
  }
  return seen;
}

/** Canonical text form stored on Artifact.rawText, so quotes stay findable. */
export function renderTranscript(lines: TranscriptLine[]): string {
  return lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join('\n');
}
