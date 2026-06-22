import { describe, expect, it } from "vitest";
import { MemoryBrain } from "./memory-client";
import type { BrainScopeCtx } from "./types";

const shared: BrainScopeCtx = {
  login: "gbrain:cl_executive@antz.ai",
  readSources: ["shared", "executive/cl_executive"],
  writeSource: "executive/cl_executive",
};
const isolated: BrainScopeCtx = {
  login: "gbrain:other@antz.ai",
  readSources: ["executive/other"],
  writeSource: "executive/other",
};

describe("MemoryBrain.flags", () => {
  it("surfaces a contradiction and a staleness flag from the seeded brain", async () => {
    const flags = await new MemoryBrain().flags(shared);
    expect(flags.some((f) => f.kind === "contradiction")).toBe(true);
    expect(flags.some((f) => f.kind === "staleness")).toBe(true);
    expect(flags.every((f) => f.pageSlugs.length > 0)).toBe(true);
  });

  it("returns nothing for a user outside the seeded sources (scoped)", async () => {
    const flags = await new MemoryBrain().flags(isolated);
    expect(flags).toHaveLength(0);
  });
});
