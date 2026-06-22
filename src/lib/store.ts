import { createHash, randomUUID } from "node:crypto";
import type { InboxKind, Route } from "./signal-detector";

/**
 * Thin app-side state (§3). The brain owns knowledge; this owns workflow.
 *
 * Phase 1 backs it in-memory (process-scoped singletons) so the slice runs
 * with zero infrastructure. The interfaces are the seam: Phase 5 swaps in
 * Postgres without touching callers. The audit log is append-only by
 * construction — there is no update/delete.
 */

export interface InboxItem {
  id: string;
  userId: string;
  rawText: string;
  sourceChannel: "paste" | "email" | "voice" | "teams" | "whatsapp" | "webhook";
  capturedAt: string;
  kind: InboxKind;
  route: Route;
  state: "captured" | "triaging" | "need" | "motion" | "done" | "dismissed";
  /** Content hash for idempotent capture (dedupe). */
  contentHash: string;
  brainPageSlug?: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  scope: string;
  /** Source pages backing any brain-derived statement (DoD). */
  citations: string[];
  createdAt: string;
}

interface Stores {
  inbox: InboxItem[];
  audit: AuditEntry[];
  /** Last dream-cycle (nightly enrichment) run, per user. */
  dreamRuns: Record<string, string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __vidurStore: Stores | undefined;
}

function stores(): Stores {
  if (!globalThis.__vidurStore) globalThis.__vidurStore = { inbox: [], audit: [], dreamRuns: {} };
  return globalThis.__vidurStore;
}

export function getDreamRun(userId: string): string | null {
  return stores().dreamRuns[userId] ?? null;
}

export function recordDreamRun(userId: string): string {
  const at = new Date().toISOString();
  stores().dreamRuns[userId] = at;
  return at;
}

export function hashContent(userId: string, text: string): string {
  return createHash("sha256").update(`${userId}:${text.trim()}`).digest("hex").slice(0, 16);
}

/** Insert a capture, or return the existing item if the content was seen. */
export function upsertCapture(
  item: Omit<InboxItem, "id" | "capturedAt" | "contentHash">,
): { item: InboxItem; deduped: boolean } {
  const s = stores();
  const contentHash = hashContent(item.userId, item.rawText);
  const existing = s.inbox.find((i) => i.userId === item.userId && i.contentHash === contentHash);
  if (existing) return { item: existing, deduped: true };

  const created: InboxItem = {
    ...item,
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    contentHash,
  };
  s.inbox.unshift(created);
  return { item: created, deduped: false };
}

export function listInbox(userId: string): InboxItem[] {
  return stores().inbox.filter((i) => i.userId === userId);
}

/** Advance an inbox item's workflow state (e.g. triaged → in motion). */
export function setItemState(userId: string, id: string, state: InboxItem["state"]): InboxItem | null {
  const item = stores().inbox.find((i) => i.id === id && i.userId === userId);
  if (!item) return null;
  item.state = state;
  return item;
}

/** Append-only: every brain answer + state change is logged with its sources. */
export function audit(entry: Omit<AuditEntry, "id" | "createdAt">): AuditEntry {
  const s = stores();
  const created: AuditEntry = { ...entry, id: randomUUID(), createdAt: new Date().toISOString() };
  s.audit.push(created);
  return created;
}

export function listAudit(actor: string): AuditEntry[] {
  return stores().audit.filter((e) => e.actor === actor);
}
