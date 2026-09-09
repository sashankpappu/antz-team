import { z } from 'zod';

/**
 * Everything the deployment decides before a share link is ever sent.
 *
 * Storage location and retention are deliberately config, not runtime choices
 * (docs/DECISIONS.md D2): an Antz operator sets them per deployment, and the
 * app refuses to accept an upload rather than pick a default location itself.
 */

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    });

const optionalInt = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const trimmed = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

const schema = z.object({
  DATABASE_URL: trimmed,
  ANTHROPIC_API_KEY: trimmed,
  INTAKE_MODEL: trimmed,

  STORAGE_DRIVER: z.enum(['local', 's3', 'none']).default('none'),
  STORAGE_LOCAL_ROOT: trimmed,
  STORAGE_S3_BUCKET: trimmed,
  STORAGE_S3_REGION: trimmed,
  STORAGE_S3_ENDPOINT: trimmed,
  STORAGE_S3_ACCESS_KEY_ID: trimmed,
  STORAGE_S3_SECRET_ACCESS_KEY: trimmed,
  STORAGE_S3_FORCE_PATH_STYLE: bool(false),

  ARTIFACT_RETENTION_DAYS: optionalInt,
  INGEST_AUDIO_ENABLED: bool(false),

  VOICE_DRIVER: z.enum(['none', 'realtime', 'push-to-talk']).default('none'),
  VOICE_TURN_BUDGET_MS: optionalInt,

  APP_BASE_URL: trimmed,
  SHARE_LINK_TTL_DAYS: optionalInt,
});

const raw = schema.parse(process.env);

/** The model used for extraction, question generation and rendering. */
export const MODEL = raw.INTAKE_MODEL ?? 'claude-opus-5';

export const config = {
  databaseUrl: raw.DATABASE_URL,
  anthropicApiKey: raw.ANTHROPIC_API_KEY,
  model: MODEL,

  storage: {
    driver: raw.STORAGE_DRIVER,
    localRoot: raw.STORAGE_LOCAL_ROOT ?? './storage',
    s3: {
      bucket: raw.STORAGE_S3_BUCKET,
      region: raw.STORAGE_S3_REGION,
      endpoint: raw.STORAGE_S3_ENDPOINT,
      accessKeyId: raw.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: raw.STORAGE_S3_SECRET_ACCESS_KEY,
      forcePathStyle: raw.STORAGE_S3_FORCE_PATH_STYLE,
    },
  },

  /** Raw artifacts older than this are eligible for hard delete. */
  artifactRetentionDays: raw.ARTIFACT_RETENTION_DAYS,

  ingest: {
    /**
     * OFF in v1 and must stay off until legal answers the third-party consent
     * question for uploaded meeting recordings (docs/DECISIONS.md D3).
     */
    audioEnabled: raw.INGEST_AUDIO_ENABLED,
  },

  voice: {
    /** Phase 2. 'none' in Phase 1 — there is no voice implementation yet. */
    driver: raw.VOICE_DRIVER,
    /** Target: exec stops speaking to next question starting, interruptible. */
    turnBudgetMs: raw.VOICE_TURN_BUDGET_MS ?? 800,
  },

  appBaseUrl: raw.APP_BASE_URL ?? 'http://localhost:3000',
  shareLinkTtlDays: raw.SHARE_LINK_TTL_DAYS,
} as const;

/** When raw artifact bytes for something uploaded now become purgeable. */
export function purgeAfterFromNow(now = new Date()): Date | null {
  if (config.artifactRetentionDays === null) return null;
  return new Date(now.getTime() + config.artifactRetentionDays * 86_400_000);
}

export function shareLinkExpiryFromNow(now = new Date()): Date | null {
  if (config.shareLinkTtlDays === null) return null;
  return new Date(now.getTime() + config.shareLinkTtlDays * 86_400_000);
}
