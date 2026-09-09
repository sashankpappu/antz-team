import { config } from '@/lib/config';

/**
 * Transcription, behind an adapter.
 *
 * Audio ingest is disabled in v1. An uploaded meeting recording captures
 * third-party voices, and how consent is handled for those is a legal question
 * that has not been answered (docs/DECISIONS.md D3). Until it is, v1 accepts
 * transcripts and documents only, with an uploader attestation logged against
 * the artifact.
 *
 * The interface is here so that turning audio on later is an implementation,
 * not a redesign: transcribed audio joins the existing transcript path and is
 * extracted into claims by the same pipeline.
 */
export interface TranscriptSegment {
  /** Speaker label, preserved because Claim.speaker matters for provenance. */
  speaker: string | null;
  text: string;
  startMs?: number;
  endMs?: number;
}

export interface TranscriptionAdapter {
  readonly driver: string;
  transcribe(audio: Uint8Array, filename: string): Promise<TranscriptSegment[]>;
}

export class AudioIngestDisabledError extends Error {
  constructor() {
    super(
      'Audio ingest is disabled in v1. Paste or upload the transcript instead. ' +
        'Enabling it requires an answered consent model for third-party voices ' +
        'in a recording (docs/DECISIONS.md D3), then INGEST_AUDIO_ENABLED=true.',
    );
    this.name = 'AudioIngestDisabledError';
  }
}

export function getTranscriptionAdapter(): TranscriptionAdapter {
  if (!config.ingest.audioEnabled) throw new AudioIngestDisabledError();
  throw new Error(
    'INGEST_AUDIO_ENABLED is true but no transcription adapter is implemented. ' +
      'Implement TranscriptionAdapter and register it here.',
  );
}
