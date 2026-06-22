/**
 * gbrain contract — the typed surface Vidur depends on.
 *
 * Mirrors the real engine's MCP operations (validated against
 * github.com/garrytan/gbrain @ v0.42.x): `search`, `think`, `put_page`,
 * `get_page`, `list_pages`. The engine returns synthesis with citations +
 * an explicit gap list; we keep those shapes intact so the UI can be honest
 * about what the brain does and doesn't know.
 */

/** Brain reads execute under the signed-in user's scope (§5). */
export interface BrainScopeCtx {
  /** The user's gbrain login slice. */
  login: string;
  /** Sources this user may read across (gbrain `--federated-read`). */
  readSources: string[];
  /** The single source this user writes to (gbrain `--source`). */
  writeSource: string;
}

/** A citation resolves to a page (and optionally a row) in the brain. */
export interface Citation {
  pageSlug: string;
  rowNum: number | null;
  /** 1-based marker as it appears inline in the answer, e.g. [1]. */
  citationIndex?: number;
}

export interface SearchHit {
  pageSlug: string;
  title: string;
  snippet: string;
  /** Hybrid score (vector + keyword + rerank), 0..1. */
  score: number;
  source: string;
}

/** Output of `think` — a synthesized answer that never hides its gaps. */
export interface ThinkResult {
  question: string;
  answer: string;
  citations: Citation[];
  /** "What the brain doesn't know yet" — surfaced verbatim in the UI. */
  gaps: string[];
  pagesGathered: number;
  modelUsed: string;
  /** True only when a real synthesis produced a non-empty answer. */
  synthesisOk: boolean;
  /** Set when the answer came from the degraded/offline path. */
  degraded?: boolean;
}

export interface BrainPage {
  slug: string;
  title: string;
  source: string;
  body: string;
}

export interface PutPageInput {
  title: string;
  body: string;
  /** Defaults to the scope's writeSource. */
  source?: string;
  /** Stable slug for idempotent captures (dedupe by content hash). */
  slug?: string;
}

/**
 * The client interface. Both the live MCP client and the in-memory brain
 * implement this, so the BFF, tests, and the degradation fallback are
 * identical against either.
 */
export interface GbrainClient {
  readonly kind: "mcp" | "memory";
  health(): Promise<{ ok: boolean; detail: string }>;
  search(scope: BrainScopeCtx, query: string, limit?: number): Promise<SearchHit[]>;
  think(scope: BrainScopeCtx, question: string, opts?: { model?: string }): Promise<ThinkResult>;
  putPage(scope: BrainScopeCtx, input: PutPageInput): Promise<BrainPage>;
  getPage(scope: BrainScopeCtx, slug: string): Promise<BrainPage | null>;
}
