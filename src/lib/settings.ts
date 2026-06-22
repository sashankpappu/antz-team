import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Runtime configuration store (§11.4 config page).
 *
 * This is the source of truth for model / provider / key settings at runtime —
 * it overrides process.env so "updates go through the interface" without
 * hand-editing .env. Secret values are encrypted at rest (AES-256-GCM, key
 * derived from AUTH_SECRET) and are NEVER returned to the browser: the public
 * view exposes only presence + the last 4 characters. (DoD: no secrets in the
 * client.)
 *
 * gbrain runs as its own process with its own config; this store drives the
 * Vidur app's runtime and how it connects to gbrain.
 */

// Non-secret fields → their env fallback. Values may be shown to the client.
const VALUE_FIELDS = {
  model: "ANTHROPIC_MODEL",
  embeddingProvider: "EMBEDDING_PROVIDER",
  gbrainHttpUrl: "GBRAIN_HTTP_URL",
  gstackLive: "GSTACK_LIVE",
  entraIssuer: "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
} as const;

// Secret fields → their env fallback. Never returned to the client.
const SECRET_FIELDS = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  zeroentropyApiKey: "ZEROENTROPY_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  voyageApiKey: "VOYAGE_API_KEY",
  gbrainServiceToken: "GBRAIN_SERVICE_TOKEN",
  databaseUrl: "DATABASE_URL",
  entraId: "AUTH_MICROSOFT_ENTRA_ID_ID",
  entraSecret: "AUTH_MICROSOFT_ENTRA_ID_SECRET",
} as const;

export type ValueField = keyof typeof VALUE_FIELDS;
export type SecretField = keyof typeof SECRET_FIELDS;

export const ALLOWED_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
] as const;

export const ALLOWED_EMBEDDINGS = ["zeroentropy", "openai", "voyage"] as const;

interface StoreShape {
  values: Partial<Record<ValueField, string>>;
  secrets: Partial<Record<SecretField, string>>; // encrypted base64
}

const STORE_PATH = join(process.cwd(), "config.local.json");

function cryptoKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to encrypt configuration");
  return scryptSync(secret, "vidur-config-v1", 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered, or AUTH_SECRET changed
  }
}

function load(): StoreShape {
  if (!existsSync(STORE_PATH)) return { values: {}, secrets: {} };
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    return { values: parsed.values ?? {}, secrets: parsed.secrets ?? {} };
  } catch {
    return { values: {}, secrets: {} };
  }
}

function save(store: StoreShape) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

// ── Server-side resolvers (store → env fallback) ──────────────────────────────

/** Resolve a non-secret value: stored override, then env. */
export function getValue(field: ValueField): string | undefined {
  const store = load();
  return store.values[field] ?? process.env[VALUE_FIELDS[field]] ?? undefined;
}

/** Resolve a secret value (decrypted): stored override, then env. Server only. */
export function getSecret(field: SecretField): string | undefined {
  const store = load();
  const enc = store.secrets[field];
  if (enc) {
    const dec = decrypt(enc);
    if (dec) return dec;
  }
  return process.env[SECRET_FIELDS[field]] ?? undefined;
}

export function isGstackLive(): boolean {
  return getValue("gstackLive") === "true";
}

// ── Public view (safe for the browser) ────────────────────────────────────────

export interface SecretStatus {
  configured: boolean;
  last4: string | null;
  source: "config" | "env" | "none";
}

export interface PublicConfig {
  values: Record<ValueField, { value: string | null; source: "config" | "env" | "none" }>;
  secrets: Record<SecretField, SecretStatus>;
  allowedModels: readonly string[];
  allowedEmbeddings: readonly string[];
}

export function getPublicConfig(): PublicConfig {
  const store = load();

  const values = {} as PublicConfig["values"];
  for (const field of Object.keys(VALUE_FIELDS) as ValueField[]) {
    if (store.values[field] != null) {
      values[field] = { value: store.values[field]!, source: "config" };
    } else if (process.env[VALUE_FIELDS[field]]) {
      values[field] = { value: process.env[VALUE_FIELDS[field]]!, source: "env" };
    } else {
      values[field] = { value: null, source: "none" };
    }
  }

  const secrets = {} as PublicConfig["secrets"];
  for (const field of Object.keys(SECRET_FIELDS) as SecretField[]) {
    const stored = store.secrets[field] ? decrypt(store.secrets[field]!) : null;
    const envVal = process.env[SECRET_FIELDS[field]] ?? null;
    const effective = stored ?? envVal;
    secrets[field] = {
      configured: Boolean(effective),
      last4: effective ? effective.slice(-4) : null,
      source: stored ? "config" : envVal ? "env" : "none",
    };
  }

  return {
    values,
    secrets,
    allowedModels: ALLOWED_MODELS,
    allowedEmbeddings: ALLOWED_EMBEDDINGS,
  };
}

// ── Updates (admin only — enforced in the route) ──────────────────────────────

export interface ConfigPatch {
  values?: Partial<Record<ValueField, string>>;
  /** string = set, null = clear, omit = leave unchanged. */
  secrets?: Partial<Record<SecretField, string | null>>;
}

/** Apply a patch, persist, and invalidate engine singletons so changes take. */
export function updateConfig(patch: ConfigPatch): { changed: string[] } {
  const store = load();
  const changed: string[] = [];

  for (const [field, value] of Object.entries(patch.values ?? {}) as [ValueField, string][]) {
    if (!(field in VALUE_FIELDS)) continue;
    if (field === "model" && value && !ALLOWED_MODELS.includes(value as never)) continue;
    if (field === "embeddingProvider" && value && !ALLOWED_EMBEDDINGS.includes(value as never)) continue;
    if (value === "") delete store.values[field];
    else store.values[field] = value;
    changed.push(field);
  }

  for (const [field, value] of Object.entries(patch.secrets ?? {}) as [SecretField, string | null][]) {
    if (!(field in SECRET_FIELDS)) continue;
    if (value === null) {
      delete store.secrets[field];
      changed.push(field);
    } else if (typeof value === "string" && value.length > 0) {
      store.secrets[field] = encrypt(value);
      changed.push(field);
    }
    // empty/undefined → leave unchanged
  }

  save(store);
  // Rebuild engines on next access so new keys/URLs take effect immediately.
  globalThis.__vidurBrain = undefined;
  globalThis.__vidurGstack = undefined;

  return { changed };
}
