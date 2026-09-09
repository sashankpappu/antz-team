import { ArtifactKind } from '@prisma/client';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractPaste, extractText, guessKind } from '@/lib/ingest/extract-text';
import { parseTranscript, renderTranscript, speakersIn } from '@/lib/ingest/transcript';
import { AudioIngestDisabledError } from '@/lib/transcription/adapter';

describe('transcript parsing', () => {
  it('keeps speaker labels, because provenance depends on them', () => {
    const lines = parseTranscript(
      'Ravi: the planner pulls the shortage list every Monday\nMeera: and emails procurement',
    );
    expect(lines).toEqual([
      { speaker: 'Ravi', text: 'the planner pulls the shortage list every Monday' },
      { speaker: 'Meera', text: 'and emails procurement' },
    ]);
  });

  it('keeps a role in the label', () => {
    const [line] = parseTranscript('Ravi Kumar (IT): SAP is the system of record');
    expect(line.speaker).toBe('Ravi Kumar (IT)');
  });

  it('attributes a continuation line to whoever was speaking', () => {
    const lines = parseTranscript('Ravi: the planner pulls the list\nand then checks it by hand');
    expect(lines).toHaveLength(1);
    expect(lines[0].speaker).toBe('Ravi');
    expect(lines[0].text).toBe('the planner pulls the list and then checks it by hand');
  });

  it('strips VTT cue timings and headers', () => {
    const lines = parseTranscript(
      ['WEBVTT', '', '1', '00:00:04.000 --> 00:00:08.000', 'Ravi: we run it every Monday'].join('\n'),
    );
    expect(lines).toEqual([{ speaker: 'Ravi', text: 'we run it every Monday' }]);
  });

  it('handles a bracketed timestamp before the name', () => {
    const [line] = parseTranscript('[10:04] Meera: procurement raises the order');
    expect(line.speaker).toBe('Meera');
    expect(line.text).toBe('procurement raises the order');
  });

  it('does not invent a speaker from an ordinary sentence with a colon', () => {
    const lines = parseTranscript(
      'The process runs in three steps: pull, check, send, and it takes about an hour',
    );
    expect(lines[0].speaker).toBeNull();
  });

  it('lists speakers in first-appearance order', () => {
    const lines = parseTranscript('Ravi: one\nMeera: two\nRavi: three');
    expect(speakersIn(lines)).toEqual(['Ravi', 'Meera']);
  });

  it('round-trips to a canonical form quotes can be matched against', () => {
    const raw = 'Ravi:   the planner pulls the list\nMeera: and emails it';
    expect(renderTranscript(parseTranscript(raw))).toBe(
      'Ravi: the planner pulls the list\nMeera: and emails it',
    );
  });
});

describe('kind detection', () => {
  it('reads a pptx as a deck and a vtt as a transcript', () => {
    expect(guessKind('board-deck.pptx')).toBe(ArtifactKind.DECK);
    expect(guessKind('call.vtt')).toBe(ArtifactKind.TRANSCRIPT);
    expect(guessKind('notes.docx')).toBe(ArtifactKind.DOC);
  });

  it('recognises audio so it can be refused rather than mis-read', () => {
    expect(guessKind('teams-recording.m4a')).toBe(ArtifactKind.AUDIO);
  });
});

describe('file extraction', () => {
  it('reads plain text', async () => {
    const bytes = new TextEncoder().encode('The planner runs the shortage report.');
    const result = await extractText('notes.txt', bytes);
    expect(result.text).toBe('The planner runs the shortage report.');
    expect(result.kind).toBe(ArtifactKind.DOC);
  });

  it('refuses audio with the reason, not a generic failure', async () => {
    await expect(
      extractText('call.m4a', new Uint8Array([0, 1, 2])),
    ).rejects.toBeInstanceOf(AudioIngestDisabledError);
  });

  it('refuses a file type it cannot read', async () => {
    await expect(
      extractText('drawing.dwg', new Uint8Array([0, 1, 2])),
    ).rejects.toThrow(/Supported/);
  });

  it('pulls slide text and speaker notes out of a pptx, in order', async () => {
    const zip = new JSZip();
    const slide = (text: string) =>
      `<?xml version="1.0"?><p:sld xmlns:a="x"><p:cSld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:cSld></p:sld>`;

    zip.file('ppt/slides/slide1.xml', slide('Shortage escalation today'));
    zip.file('ppt/slides/slide2.xml', slide('Planner pulls the list on Monday'));
    // Deliberately out of lexical order to prove numeric sorting.
    zip.file('ppt/slides/slide10.xml', slide('Next steps'));
    zip.file('ppt/notesSlides/notesSlide2.xml', slide('Takes about two hours'));

    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
    const { text, kind } = await extractText('deck.pptx', bytes);

    expect(kind).toBe(ArtifactKind.DECK);
    expect(text.indexOf('Shortage escalation today')).toBeLessThan(
      text.indexOf('Planner pulls the list on Monday'),
    );
    expect(text.indexOf('Planner pulls the list on Monday')).toBeLessThan(
      text.indexOf('Next steps'),
    );
    // Speaker notes routinely hold the detail the slide left out.
    expect(text).toContain('[Slide 2 notes] Takes about two hours');
    expect(text).toContain('--- Slide 10 ---');
  });

  it('unescapes XML entities in slide text', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><p:sld xmlns:a="x"><a:p><a:r><a:t>Ops &amp; Finance &lt;handoff&gt;</a:t></a:r></a:p></p:sld>',
    );
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
    const { text } = await extractText('deck.pptx', bytes);
    expect(text).toContain('Ops & Finance <handoff>');
  });
});

describe('paste extraction', () => {
  it('normalises a pasted transcript through the speaker parser', () => {
    const { text } = extractPaste(
      'Ravi:  the planner pulls the list\r\nMeera: and emails procurement',
      ArtifactKind.TRANSCRIPT,
    );
    expect(text).toBe('Ravi: the planner pulls the list\nMeera: and emails procurement');
  });

  it('leaves a pasted document alone apart from tidying whitespace', () => {
    const { text } = extractPaste('Some   notes\n\n\n\nmore notes', ArtifactKind.DOC);
    expect(text).toBe('Some notes\n\nmore notes');
  });
});
