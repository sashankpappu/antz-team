import { describe, expect, it } from "vitest";
import { SimulatedSprintEngine } from "./simulated-engine";
import { MemoryBrain } from "@/lib/gbrain/memory-client";
import type { BrainScopeCtx } from "@/lib/gbrain/types";

const scope: BrainScopeCtx = {
  login: "gbrain:cl_executive@antz.ai",
  readSources: ["shared", "executive/cl_executive"],
  writeSource: "executive/cl_executive",
};

function engine() {
  // stepMs=0 makes the pipeline run effectively instantly for tests.
  return new SimulatedSprintEngine(0);
}

describe("SimulatedSprintEngine", () => {
  it("runs Think→…→Ship and ends shipped", async () => {
    const e = engine();
    const started = await e.start({ userId: "u1", title: "Draft the Acme pricing page", brain: new MemoryBrain(), scope });
    expect(started.stage).toBe("think");
    expect(started.status).toBe("running");

    const done = await e.settle("u1", started.id);
    expect(done?.status).toBe("shipped");
    expect(done?.stage).toBe("ship");
    // One artifact per stage (7).
    expect(done?.artifacts.length).toBe(7);
  });

  it("Think stage records a brain-first recall with citations (the contract)", async () => {
    const e = engine();
    const s = await e.start({ userId: "u1", title: "Acme partnership pricing for Alice", brain: new MemoryBrain(), scope });
    await e.settle("u1", s.id);
    const recall = e.get("u1", s.id)?.artifacts.find((a) => a.kind === "brain-recall");
    expect(recall).toBeTruthy();
    expect((recall?.citations ?? []).length).toBeGreaterThan(0);
  });

  it("scopes sprints by user", async () => {
    const e = engine();
    const s = await e.start({ userId: "owner", title: "private", brain: new MemoryBrain(), scope });
    await e.settle("owner", s.id);
    expect(e.get("intruder", s.id)).toBeNull();
    expect(e.list("intruder")).toHaveLength(0);
  });

  it("emits live events for the board", async () => {
    const e = engine();
    const seen: string[] = [];
    const off = e.on((ev) => {
      if (ev.type === "sprint") seen.push(ev.sprint.stage);
    });
    const s = await e.start({ userId: "u1", title: "x", brain: new MemoryBrain(), scope });
    await e.settle("u1", s.id);
    off();
    expect(seen).toContain("ship");
  });
});
