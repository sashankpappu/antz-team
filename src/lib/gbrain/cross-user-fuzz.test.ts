import { describe, expect, it } from "vitest";
import { MemoryBrain } from "./memory-client";
import type { BrainScopeCtx } from "./types";

/**
 * Phase 5 hard gate (§5): hit every read path as user A and assert zero rows
 * belonging to user B. Matches gbrain's "zero cross-user leaks" bar.
 */

const userB: BrainScopeCtx = {
  login: "gbrain:bob@antz.ai",
  readSources: ["executive/bob"],
  writeSource: "executive/bob",
};
// User A shares the common "shared" source but NOT bob's private source.
const userA: BrainScopeCtx = {
  login: "gbrain:alice@antz.ai",
  readSources: ["shared", "executive/alice"],
  writeSource: "executive/alice",
};

// Distinctive, unguessable tokens that only exist in B's private notes.
const B_SECRETS = ["zarquon", "blorptastic", "qwizzle", "frobnitz", "vexlorian"];
const B_SLUGS: string[] = [];

function seededBrainWithBsPrivateData(): MemoryBrain {
  const brain = new MemoryBrain(); // includes the shared seed pages
  // Write several private pages as B.
  for (let i = 0; i < B_SECRETS.length; i++) {
    const slug = `executive/bob/secret-${i}`;
    B_SLUGS.push(slug);
    // putPage is async but the memory impl resolves synchronously enough; await in test.
    void brain.putPage(userB, {
      title: `Bob private ${B_SECRETS[i]}`,
      body: `Confidential: ${B_SECRETS[i]} deal terms, salary ${i}00k, ${B_SECRETS[i]} roadmap.`,
      slug,
    });
  }
  return brain;
}

// Tiny deterministic RNG so the fuzz run is reproducible.
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
}

describe("cross-user isolation — zero leaks (Phase 5 gate)", () => {
  it("never returns B's pages to A across search / think / graph / getPage", async () => {
    const brain = seededBrainWithBsPrivateData();
    const rand = rng(42);

    const vocab = [
      ...B_SECRETS,
      "deal",
      "salary",
      "roadmap",
      "confidential",
      "terms",
      "Bob",
      "private",
      "Acme",
      "Alice",
      "pricing",
    ];

    for (let iter = 0; iter < 200; iter++) {
      // Build a random query, biased toward B's secret terms.
      const len = 1 + Math.floor(rand() * 4);
      const q = Array.from({ length: len }, () => vocab[Math.floor(rand() * vocab.length)]).join(" ");

      const hits = await brain.search(userA, q, 20);
      for (const h of hits) {
        expect(h.source).not.toBe("executive/bob");
        expect(B_SLUGS).not.toContain(h.pageSlug);
      }

      const think = await brain.think(userA, q);
      for (const c of think.citations) expect(B_SLUGS).not.toContain(c.pageSlug);
      for (const secret of B_SECRETS) expect(think.answer.toLowerCase()).not.toContain(secret);
    }

    // Direct page access is refused.
    for (const slug of B_SLUGS) {
      expect(await brain.getPage(userA, slug)).toBeNull();
    }

    // Graph + flags never expose B's nodes/pages to A.
    const graph = await brain.graph(userA);
    for (const n of graph.nodes) expect(B_SLUGS).not.toContain(n.id);
    const flags = await brain.flags(userA);
    for (const f of flags) for (const slug of f.pageSlugs) expect(B_SLUGS).not.toContain(slug);
  });

  it("B can see B's own private pages (control — scoping isn't just blanket-deny)", async () => {
    const brain = seededBrainWithBsPrivateData();
    const hits = await brain.search(userB, "zarquon", 20);
    expect(hits.some((h) => h.source === "executive/bob")).toBe(true);
  });
});
