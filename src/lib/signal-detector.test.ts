import { describe, expect, it } from "vitest";
import { detectSignal } from "./signal-detector";

describe("detectSignal", () => {
  it("returns zero confidence for empty input", () => {
    const s = detectSignal("   ");
    expect(s.confidence).toBe(0);
    expect(s.route).toBe("know");
  });

  it("routes a bug report to 'do'", () => {
    const s = detectSignal("The login page is broken and throws an error on submit");
    expect(s.kind).toBe("bug");
    expect(s.route).toBe("do");
    expect(s.confidence).toBeGreaterThan(0.5);
  });

  it("routes an explicit task to 'do'", () => {
    const s = detectSignal("Please build a pricing page and ship it by Friday");
    expect(s.route).toBe("do");
    expect(["task", "bug"]).toContain(s.kind);
  });

  it("keeps a decision in the brain", () => {
    const s = detectSignal("Should we go with vendor A vs vendor B for billing?");
    expect(s.kind).toBe("decision");
    expect(s.route).toBe("know");
  });

  it("detects an email", () => {
    const s = detectSignal("From: alice@acme.com\nSubject: Partnership\nHi team, following up...");
    expect(s.kind).toBe("email");
  });

  it("defaults unknown text to 'know' without over-claiming confidence", () => {
    const s = detectSignal("The weather is pleasant today.");
    expect(s.route).toBe("know");
    expect(s.confidence).toBeLessThan(0.5);
  });

  it("never reports confidence above the heuristic ceiling", () => {
    const s = detectSignal("bug error broken crash regression fails fails fails");
    expect(s.confidence).toBeLessThanOrEqual(0.9);
  });
});
