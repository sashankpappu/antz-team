import type {
  BrainFlag,
  BrainGraph,
  BrainPage,
  BrainScopeCtx,
  EntityType,
  GbrainClient,
  GraphNode,
  PutPageInput,
  SearchHit,
  ThinkResult,
} from "./types";

function entityType(slug: string): EntityType {
  if (slug.startsWith("people/")) return "person";
  if (slug.startsWith("companies/")) return "company";
  if (slug.startsWith("deals/")) return "deal";
  if (slug.startsWith("projects/")) return "project";
  return "note";
}

/**
 * In-memory brain — the zero-config local/test implementation of GbrainClient,
 * and the graceful-degradation fallback when the live engine is unreachable
 * (§ guardrails: capture + brain-lite must keep working).
 *
 * It is deterministic: no LLM, no network. `think` stitches the top hits into
 * an honest answer with real citations and surfaces each matched page's open
 * questions as the gap note. The live MCP client returns the same shapes from
 * the real gbrain synthesis pipeline.
 *
 * Scoping mirrors gbrain's model: reads are restricted to `scope.readSources`,
 * writes land in `scope.writeSource`. This is the precursor to the Phase 5
 * cross-user fuzz test.
 */

interface SeedPage extends BrainPage {
  openQuestions?: string[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "we", "do", "what", "about", "know", "our", "at", "as", "by", "it",
  "this", "that", "from", "be", "have", "has",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t),
  );
}

/** Seed fixtures so the CEO "Alice / Acme" scenario works with no engine. */
function seedPages(): SeedPage[] {
  return [
    {
      slug: "people/alice-johnson",
      title: "Alice Johnson",
      source: "shared",
      body: "Alice Johnson is VP of Partnerships at Acme Corp. Primary contact for the Acme partnership. Prefers async email. Met at the Q1 partner summit; sponsors the integration on Acme's side.",
      openQuestions: [
        "Alice's decision-making authority on contract value is unconfirmed.",
        "No record of her budget cycle or fiscal-year timing.",
      ],
    },
    {
      slug: "companies/acme-corp",
      title: "Acme Corp",
      source: "shared",
      body: "Acme Corp is a mid-market logistics company, ~800 employees. Evaluating Vidur for an executive-ops pilot. Champion is Alice Johnson (VP Partnerships).",
      openQuestions: [
        "Acme's security review requirements (SOC 2 scope) are not yet documented.",
      ],
    },
    {
      slug: "deals/acme-partnership",
      title: "Acme partnership",
      source: "shared",
      body: "Open deal with Acme Corp. Pilot proposed for two executive teams. Pricing discussed verbally but not finalized. Champion: Alice Johnson. Legal review pending on data-residency terms.",
      openQuestions: [
        "Pricing is not finalized — no signed term sheet.",
        "Legal review of data-residency terms is pending.",
        "Go-live date has not been agreed.",
      ],
    },
  ];
}

export class MemoryBrain implements GbrainClient {
  readonly kind = "memory" as const;
  private pages: Map<string, SeedPage>;

  constructor(seed = true) {
    this.pages = new Map();
    if (seed) for (const p of seedPages()) this.pages.set(p.slug, p);
  }

  async health() {
    return { ok: true, detail: `in-memory brain · ${this.pages.size} pages` };
  }

  private readable(scope: BrainScopeCtx): SeedPage[] {
    const allowed = new Set(scope.readSources);
    return [...this.pages.values()].filter((p) => allowed.has(p.source));
  }

  private rank(scope: BrainScopeCtx, query: string): Array<{ page: SeedPage; score: number }> {
    const qTokens = new Set(tokenize(query));
    if (qTokens.size === 0) return [];
    const scored = this.readable(scope).map((page) => {
      const pTokens = tokenize(`${page.title} ${page.body}`);
      let overlap = 0;
      for (const t of pTokens) if (qTokens.has(t)) overlap += 1;
      // Normalize toward 0..1; title matches weighted by the short field.
      const score = overlap / Math.max(qTokens.size, 1);
      return { page, score };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  }

  async search(scope: BrainScopeCtx, query: string, limit = 5): Promise<SearchHit[]> {
    return this.rank(scope, query)
      .slice(0, limit)
      .map(({ page, score }) => ({
        pageSlug: page.slug,
        title: page.title,
        snippet: page.body.slice(0, 180),
        score: Math.min(1, score),
        source: page.source,
      }));
  }

  async think(scope: BrainScopeCtx, question: string): Promise<ThinkResult> {
    const ranked = this.rank(scope, question).slice(0, 4);

    if (ranked.length === 0) {
      return {
        question,
        answer: "",
        citations: [],
        gaps: ["The brain has nothing on this yet — capture a note or source to teach it."],
        pagesGathered: 0,
        modelUsed: "memory",
        synthesisOk: false,
      };
    }

    // Deterministic synthesis: stitch the leading sentence of each top page,
    // marked with an inline citation index.
    const sentences = ranked.map(({ page }, i) => {
      const first = page.body.split(/(?<=\.)\s/)[0] ?? page.body;
      return `${first} [${i + 1}]`;
    });
    const answer = sentences.join(" ");

    const citations = ranked.map(({ page }, i) => ({
      pageSlug: page.slug,
      rowNum: null,
      citationIndex: i + 1,
    }));

    const gaps = [...new Set(ranked.flatMap(({ page }) => page.openQuestions ?? []))];

    return {
      question,
      answer,
      citations,
      gaps: gaps.length > 0 ? gaps : ["No open questions recorded on the cited pages."],
      pagesGathered: ranked.length,
      modelUsed: "memory",
      synthesisOk: true,
    };
  }

  async putPage(scope: BrainScopeCtx, input: PutPageInput): Promise<BrainPage> {
    const source = input.source ?? scope.writeSource;
    const slug =
      input.slug ??
      `${source}/${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const page: SeedPage = { slug, title: input.title, source, body: input.body };
    // Idempotent: same slug overwrites rather than duplicating.
    this.pages.set(slug, page);
    return page;
  }

  async getPage(scope: BrainScopeCtx, slug: string): Promise<BrainPage | null> {
    const page = this.pages.get(slug);
    if (!page) return null;
    if (!scope.readSources.includes(page.source)) return null; // scope-enforced
    return page;
  }

  async flags(scope: BrainScopeCtx): Promise<BrainFlag[]> {
    const readable = new Set(this.readable(scope).map((p) => p.slug));
    const out: BrainFlag[] = [];
    // Seeded contradiction: the deal page implies a price was discussed, while
    // it also says pricing isn't finalized — worth a human glance.
    if (readable.has("deals/acme-partnership") && readable.has("companies/acme-corp")) {
      out.push({
        kind: "contradiction",
        summary:
          "Acme pricing was discussed verbally, but the deal note also says pricing is not finalized — these disagree.",
        pageSlugs: ["deals/acme-partnership", "companies/acme-corp"],
      });
    }
    // Seeded staleness: Alice's authority hasn't been confirmed for a while.
    if (readable.has("people/alice-johnson")) {
      out.push({
        kind: "staleness",
        summary: "Alice Johnson's decision authority is still unconfirmed — the note may be going stale.",
        pageSlugs: ["people/alice-johnson"],
      });
    }
    return out;
  }

  async graph(scope: BrainScopeCtx): Promise<BrainGraph> {
    // Self-wiring: an edge exists where one readable page's body names another
    // readable page's title. Scoping is enforced — only readable pages appear.
    const pages = this.readable(scope);
    const nodes: GraphNode[] = pages.map((p) => ({ id: p.slug, label: p.title, type: entityType(p.slug) }));
    const edges: BrainGraph["edges"] = [];
    for (const from of pages) {
      for (const to of pages) {
        if (from.slug === to.slug) continue;
        if (from.body.toLowerCase().includes(to.title.toLowerCase())) {
          edges.push({ from: from.slug, to: to.slug, type: "mentions" });
        }
      }
    }
    return { nodes, edges };
  }
}
