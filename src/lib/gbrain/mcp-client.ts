import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  BrainFlag,
  BrainPage,
  BrainScopeCtx,
  Citation,
  GbrainClient,
  PutPageInput,
  SearchHit,
  ThinkResult,
} from "./types";

/**
 * Live gbrain client over MCP Streamable HTTP (`gbrain serve --http`).
 *
 * Validated against the real engine (github.com/garrytan/gbrain): tools are
 * one-per-operation (`search`, `think`, `put_page`, `get_page`, …) and `think`
 * returns { answer, citations:[{page_slug,row_num,citation_index}], gaps[],
 * modelUsed }. We map those into Vidur's typed shapes.
 *
 * Scoping: the bearer token is a per-user (server-to-server) gbrain OAuth
 * client whose `--federated-read` sources enforce isolation at the SQL layer.
 * The token never reaches the browser (§5).
 */
export class McpBrain implements GbrainClient {
  readonly kind = "mcp" as const;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(`${this.url}/mcp`), {
        requestInit: {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      });
      const client = new Client(
        { name: "vidur", version: "0.1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /** Call an op by name and parse its JSON text payload. */
  private async callOp<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.connect();
    const res = await client.callTool({ name, arguments: args });
    if ((res as { isError?: boolean }).isError) {
      throw new Error(`gbrain op '${name}' returned an error`);
    }
    const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const text = content.find((c) => c.type === "text")?.text ?? "{}";
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some ops return prose; wrap it so callers get a stable shape.
      return text as unknown as T;
    }
  }

  async health() {
    try {
      await this.callOp("get_health", {});
      return { ok: true, detail: "gbrain serve --http reachable" };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "unreachable" };
    }
  }

  async search(scope: BrainScopeCtx, query: string, limit = 5): Promise<SearchHit[]> {
    const raw = await this.callOp<{ results?: Array<Record<string, unknown>> }>("search", {
      query,
      limit,
      sources: scope.readSources,
    });
    const rows = raw.results ?? [];
    return rows.map((r) => ({
      pageSlug: String(r.page_slug ?? r.slug ?? ""),
      title: String(r.title ?? ""),
      snippet: String(r.snippet ?? r.excerpt ?? ""),
      score: Number(r.score ?? 0),
      source: String(r.source ?? ""),
    }));
  }

  async think(scope: BrainScopeCtx, question: string, opts?: { model?: string }): Promise<ThinkResult> {
    const raw = await this.callOp<{
      answer?: string;
      citations?: Array<{ page_slug?: string; row_num?: number | null; citation_index?: number }>;
      gaps?: string[];
      pagesGathered?: number;
      modelUsed?: string;
      synthesisOk?: boolean;
    }>("think", {
      question,
      sources: scope.readSources,
      ...(opts?.model ? { model: opts.model } : {}),
    });

    const citations: Citation[] = (raw.citations ?? []).map((c) => ({
      pageSlug: String(c.page_slug ?? ""),
      rowNum: c.row_num ?? null,
      citationIndex: c.citation_index,
    }));

    return {
      question,
      answer: raw.answer ?? "",
      citations,
      gaps: raw.gaps ?? [],
      pagesGathered: raw.pagesGathered ?? citations.length,
      modelUsed: raw.modelUsed ?? "unknown",
      synthesisOk: raw.synthesisOk ?? Boolean(raw.answer),
    };
  }

  async putPage(scope: BrainScopeCtx, input: PutPageInput): Promise<BrainPage> {
    const source = input.source ?? scope.writeSource;
    const raw = await this.callOp<Record<string, unknown>>("put_page", {
      title: input.title,
      body: input.body,
      source,
      ...(input.slug ? { slug: input.slug } : {}),
    });
    return {
      slug: String(raw.slug ?? input.slug ?? ""),
      title: input.title,
      source,
      body: input.body,
    };
  }

  async getPage(scope: BrainScopeCtx, slug: string): Promise<BrainPage | null> {
    try {
      const raw = await this.callOp<Record<string, unknown> | null>("get_page", { slug });
      if (!raw || Object.keys(raw).length === 0) return null;
      return {
        slug: String(raw.slug ?? slug),
        title: String(raw.title ?? ""),
        source: String(raw.source ?? ""),
        body: String(raw.body ?? raw.content ?? ""),
      };
    } catch {
      return null;
    }
  }

  async flags(scope: BrainScopeCtx): Promise<BrainFlag[]> {
    // gbrain exposes `find_contradictions`; staleness via `find_anomalies`.
    const out: BrainFlag[] = [];
    try {
      const c = await this.callOp<{ contradictions?: Array<{ summary?: string; page_slugs?: string[] }> }>(
        "find_contradictions",
        { sources: scope.readSources },
      );
      for (const item of c.contradictions ?? []) {
        out.push({
          kind: "contradiction",
          summary: String(item.summary ?? "Two notes disagree."),
          pageSlugs: item.page_slugs ?? [],
        });
      }
    } catch {
      /* contradictions unavailable */
    }
    return out;
  }
}
