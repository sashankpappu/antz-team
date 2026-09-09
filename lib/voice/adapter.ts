import { config } from '@/lib/config';

/**
 * Voice, behind an adapter. NOT IMPLEMENTED IN PHASE 1.
 *
 * The decided target (docs/DECISIONS.md D1) is under 800ms from the exec
 * finishing to the next question starting, interruptible — which means a
 * speech-to-speech realtime layer, not an STT/LLM/TTS chain.
 *
 * That budget is only reachable because the interviewer never waits on the
 * completeness engine: `nextQuestion` below is a cache read (see
 * lib/interview/gap-cache.ts) that returns without a model call or a database
 * write on the critical path. Rescoring happens after the turn, out of band.
 * A realtime implementation is therefore a swap behind this interface rather
 * than a rewrite — which is the whole reason Phase 1 ships text first.
 */
export interface VoiceTurn {
  /** What the exec said, as text. */
  transcript: string;
  /** True when the exec talked over the interviewer and cut it off. */
  interrupted: boolean;
  /** Measured exec-stops-speaking to first-audio-out, for the budget check. */
  turnLatencyMs?: number;
}

export interface VoiceAdapter {
  readonly driver: string;
  /** Target latency this adapter is expected to hold, in milliseconds. */
  readonly turnBudgetMs: number;
  /**
   * Open a session. The adapter owns the audio; it calls `speak` with the
   * question text it should voice next and reports each completed exec turn.
   */
  open(options: {
    workspaceId: string;
    /** Cache read. Must not perform I/O that can exceed the turn budget. */
    nextQuestion: () => Promise<string>;
    onTurn: (turn: VoiceTurn) => Promise<void>;
  }): Promise<{ close: () => Promise<void> }>;
}

export class VoiceNotAvailableError extends Error {
  constructor(driver: string) {
    super(
      `Voice driver "${driver}" is not implemented. Voice is Phase 2; Phase 1 ` +
        `runs the same interviewer over text. Set VOICE_DRIVER=none.`,
    );
    this.name = 'VoiceNotAvailableError';
  }
}

export function getVoiceAdapter(): VoiceAdapter {
  throw new VoiceNotAvailableError(config.voice.driver);
}

export function isVoiceEnabled(): boolean {
  return config.voice.driver !== 'none';
}
