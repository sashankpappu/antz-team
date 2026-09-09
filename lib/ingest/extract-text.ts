import { ArtifactKind } from '@prisma/client';
import JSZip from 'jszip';
import { AudioIngestDisabledError } from '@/lib/transcription/adapter';
import { parseTranscript, renderTranscript } from './transcript';

/**
 * File to plain text. Every input type lands as an Artifact with extracted
 * text; none of it is treated as truth. Claim extraction runs afterwards over
 * this text, and every claim quotes from it.
 */

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(
      `Cannot read "${filename}". Supported: PDF, Word (.docx), PowerPoint (.pptx), ` +
        `and plain text (.txt, .md, .csv, .vtt, .srt). Paste the content instead if ` +
        `the file is something else.`,
    );
    this.name = 'UnsupportedFileTypeError';
  }
}

export interface ExtractedText {
  text: string;
  kind: ArtifactKind;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Collapse the runs of whitespace that PDF and PPTX extraction leave behind. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // Imported by library path on purpose — see types/pdf-parse.d.ts.
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
  const result = await pdfParse(Buffer.from(bytes));
  return result.text;
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/**
 * PowerPoint. Decks are a first-class input — they are usually the thing the
 * exec already sent — so slide order and per-slide grouping are preserved:
 * "slide 4 says the planner runs the shortage report" is a better provenance
 * anchor than an undifferentiated wall of text.
 */
async function extractPptx(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const notePaths = new Set(
    Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)),
  );

  const out: string[] = [];

  for (const path of slidePaths) {
    const n = slideNumber(path);
    const xml = await zip.files[path].async('string');
    const body = xmlTextRuns(xml);
    out.push(`--- Slide ${n} ---`);
    if (body) out.push(body);

    const notesPath = `ppt/notesSlides/notesSlide${n}.xml`;
    if (notePaths.has(notesPath)) {
      const notes = xmlTextRuns(await zip.files[notesPath].async('string'));
      // Speaker notes routinely hold the detail the slide left out.
      if (notes) out.push(`[Slide ${n} notes] ${notes}`);
    }
  }

  return out.join('\n');
}

function slideNumber(path: string): number {
  const match = /(\d+)\.xml$/.exec(path);
  return match ? Number(match[1]) : 0;
}

/**
 * Pull the <a:t> text runs out of an OOXML part. A full XML parse buys nothing
 * here: the runs are the text, and paragraph breaks come from <a:p>.
 */
function xmlTextRuns(xml: string): string {
  return xml
    .replace(/<a:p\b[^>]*>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<a:br\b[^>]*\/?>/g, '\n')
    .replace(/<a:t>([\s\S]*?)<\/a:t>/g, (_, t: string) => ` ${t} `)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Guess the artifact kind from the file. The operator can override it at
 * upload, because a "doc" that is really a call transcript should follow the
 * transcript path and keep its speaker labels.
 */
export function guessKind(filename: string): ArtifactKind {
  const ext = extensionOf(filename);
  if (ext === 'pptx' || ext === 'ppt') return ArtifactKind.DECK;
  if (ext === 'vtt' || ext === 'srt') return ArtifactKind.TRANSCRIPT;
  if (['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'flac', 'webm'].includes(ext)) {
    return ArtifactKind.AUDIO;
  }
  return ArtifactKind.DOC;
}

export async function extractText(
  filename: string,
  bytes: Uint8Array,
  kindOverride?: ArtifactKind,
): Promise<ExtractedText> {
  const kind = kindOverride ?? guessKind(filename);

  if (kind === ArtifactKind.AUDIO) {
    // Not "unsupported" — deliberately switched off until consent is settled.
    throw new AudioIngestDisabledError();
  }

  const ext = extensionOf(filename);
  let text: string;

  switch (ext) {
    case 'pdf':
      text = await extractPdf(bytes);
      break;
    case 'docx':
      text = await extractDocx(bytes);
      break;
    case 'pptx':
      text = await extractPptx(bytes);
      break;
    case 'txt':
    case 'md':
    case 'markdown':
    case 'csv':
    case 'tsv':
    case 'log':
    case 'json':
    case 'vtt':
    case 'srt':
    case '':
      text = new TextDecoder('utf-8').decode(bytes);
      break;
    default:
      throw new UnsupportedFileTypeError(filename);
  }

  const tidied = tidy(text);

  // Transcripts and chat go through the speaker parser so the stored text is
  // in one canonical "Speaker: line" form that quotes can be matched against.
  if (kind === ArtifactKind.TRANSCRIPT || kind === ArtifactKind.CHAT) {
    return { text: renderTranscript(parseTranscript(tidied)), kind };
  }

  return { text: tidied, kind };
}

/** Pasted text. Same pipeline, no file. */
export function extractPaste(raw: string, kind: ArtifactKind): ExtractedText {
  const tidied = tidy(raw);
  if (kind === ArtifactKind.TRANSCRIPT || kind === ArtifactKind.CHAT) {
    return { text: renderTranscript(parseTranscript(tidied)), kind };
  }
  return { text: tidied, kind };
}
