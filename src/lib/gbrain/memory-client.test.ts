import { describe, expect, it } from "vitest";
import { MemoryBrain } from "./memory-client";
import type { BrainScopeCtx } from "./types";

const shared: BrainScopeCtx = {
  login: "gbrain:cl_executive@antz.ai",
  readSources: ["shared", "executive/cl_executive"],
  writeSource: "executive/cl_executive",
};

// A user with no access to the shared brain — the scoping control.
const isolated: BrainScopeCtx = {
  login: "gbrain:other@antz.ai",
  readSources: ["executive/other"],
  writeSource: "executive/other",
};

describe("MemoryBrain.think", () => {
  it("synthesizes an answer with citations and gaps for a known entity", async () => {
    const brain = new MemoryBrain();
    const r = await brain.think(shared, "What do we know about Alice at Acme?");
    expect(r.synthesisOk).toBe(true);
    expect(r.answer.length).toBeGreaterThan(0);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].pageSlug).toContain("alice");
    // Honest about the unknowns.
    expect(r.gaps.join(" ").toLowerCase()).toContain("pricing");
  });

  it("returns an empty, honest result when the brain knows nothing", async () => {
    const brain = new MemoryBrain();
    const r = await brain.think(shared, "underwater basket weaving championship schedule");
    expect(r.synthesisOk).toBe(false);
    expect(r.answer).toBe("");
    expect(r.gaps.length).toBeGreaterThan(0);
  });
});

describe("MemoryBrain scoping (Phase 5 precursor)", () => {
  it("returns zero hits for a user outside the source", async () => {
    const brain = new MemoryBrain();
    const hits = await brain.search(isolated, "Alice Acme partnership");
    expect(hits).toHaveLength(0);
  });

  it("refuses to return a page outside the reader's scope", async () => {
    const brain = new MemoryBrain();
    const page = await brain.getPage(isolated, "people/alice-johnson");
    expect(page).toBeNull();
  });
});

describe("MemoryBrain.putPage", () => {
  it("is idempotent on slug (no duplicates)", async () => {
    const brain = new MemoryBrain(false);
    await brain.putPage(shared, { title: "Note", body: "v1", slug: "shared/note" });
    await brain.putPage(shared, { title: "Note", body: "v2", slug: "shared/note" });
    const page = await brain.getPage(shared, "shared/note");
    expect(page?.body).toBe("v2");
  });
});
