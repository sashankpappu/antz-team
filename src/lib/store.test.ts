import { describe, expect, it } from "vitest";
import { audit, hashContent, listAudit, listInbox, upsertCapture } from "./store";

describe("store — idempotent capture", () => {
  it("dedupes identical content for the same user", () => {
    const base = {
      userId: "u1",
      rawText: "Follow up with Alice at Acme about pricing",
      sourceChannel: "paste" as const,
      kind: "task" as const,
      route: "do" as const,
      state: "triaging" as const,
    };
    const first = upsertCapture(base);
    const second = upsertCapture(base);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.item.id).toBe(first.item.id);
  });

  it("isolates inbox listings by user", () => {
    upsertCapture({
      userId: "u2",
      rawText: "private note",
      sourceChannel: "paste",
      kind: "idea",
      route: "know",
      state: "captured",
    });
    expect(listInbox("u2").some((i) => i.userId !== "u2")).toBe(false);
  });

  it("hashes content stably and per-user", () => {
    expect(hashContent("u1", " hi ")).toBe(hashContent("u1", "hi"));
    expect(hashContent("u1", "hi")).not.toBe(hashContent("u2", "hi"));
  });
});

describe("store — audit log", () => {
  it("appends entries with their citations", () => {
    audit({ actor: "u3", action: "think", target: "q", scope: "shared", citations: ["people/alice-johnson"] });
    const entries = listAudit("u3");
    expect(entries).toHaveLength(1);
    expect(entries[0].citations).toContain("people/alice-johnson");
    expect(entries[0].createdAt).toBeTruthy();
  });
});
