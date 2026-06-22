import type { Session } from "next-auth";
import { MemoryBrain } from "./memory-client";
import { McpBrain } from "./mcp-client";
import type {
  BrainFlag,
  BrainGraph,
  BrainPage,
  BrainScopeCtx,
  GbrainClient,
  PutPageInput,
  SearchHit,
  ThinkResult,
} from "./types";

export type {
  BrainScopeCtx,
  Citation,
  SearchHit,
  ThinkResult,
  BrainPage,
  BrainFlag,
  BrainGraph,
  GraphNode,
  GraphEdge,
  EntityType,
} from "./types";

/**
 * Derive a brain scope from the signed-in session (§5). Every brain read runs
 * under this. Admins/members read the shared brain plus their own slice;
 * everyone writes only to their own slice (gbrain `--source` convention).
 */
export function scopeForSession(session: Session | null): BrainScopeCtx {
  const login = session?.user?.gbrainLogin ?? "anonymous";
  const localPart = login.replace(/^gbrain:/, "").split("@")[0] || "anonymous";
  const writeSource = `executive/${localPart}`;
  return {
    login,
    readSources: ["shared", writeSource],
    writeSource,
  };
}

/**
 * Wraps the live client so a brain outage degrades gracefully to the
 * in-memory brain instead of breaking capture (§ guardrails). `think`
 * answers from the fallback are flagged `degraded` so the UI can say so.
 */
class DegradingBrain implements GbrainClient {
  readonly kind = "mcp" as const;
  constructor(
    private readonly live: GbrainClient,
    private readonly fallback: GbrainClient,
  ) {}

  async health() {
    return this.live.health();
  }

  async search(scope: BrainScopeCtx, query: string, limit?: number): Promise<SearchHit[]> {
    try {
      return await this.live.search(scope, query, limit);
    } catch {
      return this.fallback.search(scope, query, limit);
    }
  }

  async think(scope: BrainScopeCtx, question: string, opts?: { model?: string }): Promise<ThinkResult> {
    try {
      return await this.live.think(scope, question, opts);
    } catch {
      const r = await this.fallback.think(scope, question, opts);
      return { ...r, degraded: true };
    }
  }

  async putPage(scope: BrainScopeCtx, input: PutPageInput): Promise<BrainPage> {
    try {
      return await this.live.putPage(scope, input);
    } catch {
      return this.fallback.putPage(scope, input);
    }
  }

  async getPage(scope: BrainScopeCtx, slug: string): Promise<BrainPage | null> {
    try {
      return await this.live.getPage(scope, slug);
    } catch {
      return this.fallback.getPage(scope, slug);
    }
  }

  async flags(scope: BrainScopeCtx): Promise<BrainFlag[]> {
    try {
      return await this.live.flags(scope);
    } catch {
      return this.fallback.flags(scope);
    }
  }

  async graph(scope: BrainScopeCtx): Promise<BrainGraph> {
    try {
      return await this.live.graph(scope);
    } catch {
      return this.fallback.graph(scope);
    }
  }
}

// Process-scoped singletons. The memory brain persists captures within a dev
// session; swap-in is purely an env decision so prod wiring is one variable.
declare global {
  // eslint-disable-next-line no-var
  var __vidurBrain: GbrainClient | undefined;
}

function build(): GbrainClient {
  const url = process.env.GBRAIN_HTTP_URL;
  const token = process.env.GBRAIN_SERVICE_TOKEN;
  const memory = new MemoryBrain();
  if (url && token) {
    return new DegradingBrain(new McpBrain(url, token), memory);
  }
  return memory;
}

/** The brain client for this process. */
export function getGbrain(): GbrainClient {
  if (!globalThis.__vidurBrain) globalThis.__vidurBrain = build();
  return globalThis.__vidurBrain;
}
