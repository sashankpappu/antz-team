/**
 * Signal detector — the first thing that touches a captured input.
 *
 * v1 is a fast, deterministic, brain-free heuristic classifier. It runs
 * instantly on capture so the composer can propose a route ("know vs do")
 * without an API round-trip. Phase 1 layers gbrain recall on top; this stays
 * as the zero-latency floor and the graceful-degradation path.
 */

export type InboxKind = "idea" | "bug" | "decision" | "email" | "task";

/** Brain-first triage: does this rest in the brain, or spin a sprint? */
export type Route = "know" | "do";

export interface Signal {
  kind: InboxKind;
  route: Route;
  /** 0..1 — how confident the heuristic is. Low confidence ⇒ ask, don't act. */
  confidence: number;
  /** Human-readable reason, shown inline in the composer. */
  rationale: string;
}

interface Rule {
  kind: InboxKind;
  route: Route;
  patterns: RegExp[];
}

// Order matters: earlier rules win ties. Most specific first.
const RULES: Rule[] = [
  {
    kind: "bug",
    route: "do",
    patterns: [/\bbug\b/i, /\berror\b/i, /\bbroken?\b/i, /\bcrash/i, /\bregression\b/i, /\bfails?\b/i],
  },
  {
    kind: "decision",
    route: "know",
    patterns: [/\bshould we\b/i, /\bdecide\b/i, /\bdecision\b/i, /\bvs\.?\b/i, /\boption [ab]\b/i, /\bapprove\b/i],
  },
  {
    kind: "email",
    route: "know",
    patterns: [/\bfrom:.*@/i, /\bsubject:/i, /\b\S+@\S+\.\S+/, /\bhi (team|all|there)\b/i, /\bregards\b/i],
  },
  {
    kind: "task",
    route: "do",
    patterns: [/\bplease\b/i, /\bcan you\b/i, /\bship\b/i, /\bbuild\b/i, /\bfix\b/i, /\bcreate\b/i, /\bdraft\b/i, /\bby (mon|tue|wed|thu|fri|sat|sun|tomorrow|eod)/i],
  },
  {
    kind: "idea",
    route: "know",
    patterns: [/\bidea\b/i, /\bwhat if\b/i, /\bwe could\b/i, /\bmaybe\b/i, /\bconsider\b/i],
  },
];

const KIND_LABEL: Record<InboxKind, string> = {
  idea: "an idea",
  bug: "a bug report",
  decision: "a decision to weigh",
  email: "an email",
  task: "a task to do",
};

/**
 * Classify raw captured text into a kind + suggested route.
 * Pure and synchronous — safe to call on every keystroke.
 */
export function detectSignal(raw: string): Signal {
  const text = (raw ?? "").trim();

  if (text.length === 0) {
    return {
      kind: "idea",
      route: "know",
      confidence: 0,
      rationale: "Nothing captured yet.",
    };
  }

  const scores = new Map<Rule, number>();
  for (const rule of RULES) {
    let hits = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) hits += 1;
    }
    if (hits > 0) scores.set(rule, hits);
  }

  if (scores.size === 0) {
    // No signal matched — default to "know" so it rests in the brain safely
    // rather than auto-spinning work we weren't asked for.
    return {
      kind: "idea",
      route: "know",
      confidence: 0.3,
      rationale: "No strong signal — Vidur will hold this in the brain unless you route it.",
    };
  }

  // Highest hit-count wins; RULES order breaks ties (Map preserves insert order).
  let best: Rule = RULES[0];
  let bestHits = -1;
  for (const [rule, hits] of scores) {
    if (hits > bestHits) {
      best = rule;
      bestHits = hits;
    }
  }

  // Confidence scales with hits but is capped — heuristics never claim certainty.
  const confidence = Math.min(0.9, 0.45 + bestHits * 0.15);

  return {
    kind: best.kind,
    route: best.route,
    confidence,
    rationale:
      best.route === "do"
        ? `Looks like ${KIND_LABEL[best.kind]} — Vidur suggests starting a sprint.`
        : `Looks like ${KIND_LABEL[best.kind]} — Vidur suggests keeping it in the brain.`,
  };
}
