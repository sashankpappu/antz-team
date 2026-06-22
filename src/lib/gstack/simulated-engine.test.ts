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
  return new SimulatedSprintEngine(0); // stepMs=0 → runs fast
}

/** Wait until a sprint raises its Design fork. */
async function waitForDecision(e: SimulatedSprintEngine, userId: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const open = e.listDecisions(userId).find((d) => !d.resolution);
    if (open) return open.id;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("no decision raised");
}

describe("SimulatedSprintEngine", () => {
  it("blocks on a Design fork, then ships once resolved", async () => {
    const e = engine();
    const started = await e.start({ userId: "u1", title: "Draft the Acme pricing page", brain: new MemoryBrain(), scope });
    expect(started.stage).toBe("think");

    const decisionId = await waitForDecision(e, "u1");
    expect(e.get("u1", started.id)?.status).toBe("blocked");

    e.resolveDecision("u1", decisionId, "approve");
    const done = await e.settle("u1", started.id);
    expect(done?.status).toBe("shipped");
    expect(done?.stage).toBe("ship");
    expect(done?.artifacts.length).toBe(7);
  });

  it("Think stage records a brain-first recall with citations (the contract)", async () => {
    const e = engine();
    const s = await e.start({ userId: "u1", title: "Acme partnership pricing for Alice", brain: new MemoryBrain(), scope });
    const id = await waitForDecision(e, "u1");
    e.resolveDecision("u1", id, "approve");
    await e.settle("u1", s.id);
    const recall = e.get("u1", s.id)?.artifacts.find((a) => a.kind === "brain-recall");
    expect((recall?.citations ?? []).length).toBeGreaterThan(0);
  });

  it("raises a security fork for security-flavored titles", async () => {
    const e = engine();
    await e.start({ userId: "u1", title: "Rotate the leaked auth token", brain: new MemoryBrain(), scope });
    const id = await waitForDecision(e, "u1");
    expect(e.listDecisions("u1").find((d) => d.id === id)?.type).toBe("security");
  });

  it("scopes sprints and decisions by user", async () => {
    const e = engine();
    const s = await e.start({ userId: "owner", title: "private", brain: new MemoryBrain(), scope });
    await waitForDecision(e, "owner");
    expect(e.get("intruder", s.id)).toBeNull();
    expect(e.listDecisions("intruder")).toHaveLength(0);
    // An intruder cannot resolve someone else's fork.
    const id = e.listDecisions("owner")[0].id;
    expect(e.resolveDecision("intruder", id, "approve")).toBeNull();
  });
});
