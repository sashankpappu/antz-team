import type { BrainScopeCtx, Citation, GbrainClient } from "@/lib/gbrain/types";

/** The gstack pipeline (§4). Order is the board's left-to-right flow. */
export const STAGES = ["think", "plan", "design", "build", "review", "test", "ship"] as const;
export type Stage = (typeof STAGES)[number];

export type SprintStatus = "running" | "shipped" | "blocked";

export type DecisionType = "taste" | "scope" | "risk" | "security";
export type DecisionResolution = "approve" | "adjust" | "reject";

export interface DecisionOption {
  id: string;
  label: string;
  detail: string;
}

/** A human-only fork (§4). The crew recommends; the executive decides. */
export interface Decision {
  id: string;
  sprintId: string;
  userId: string;
  type: DecisionType;
  summary: string;
  /** The crew's recommendation, in plain English. */
  recommendation: string;
  options: DecisionOption[];
  /** Which option id the crew recommends (the default). */
  recommendedOptionId: string;
  createdAt: string;
  resolution?: DecisionResolution;
  resolvedOptionId?: string;
  resolvedAt?: string;
}

export interface Artifact {
  id: string;
  stage: Stage;
  title: string;
  body: string;
  kind: "brain-recall" | "plan" | "design" | "note" | "release";
  /** Present on the Think stage's brain-first recall. */
  citations?: Citation[];
  createdAt: string;
}

export interface LogEntry {
  at: string;
  stage: Stage;
  message: string;
}

export interface Sprint {
  id: string;
  userId: string;
  title: string;
  inboxItemId?: string;
  stage: Stage;
  status: SprintStatus;
  artifacts: Artifact[];
  log: LogEntry[];
  startedAt: string;
  updatedAt: string;
}

/** Streamed to the Execute board over SSE. */
export type SprintEvent =
  | { type: "snapshot"; sprints: Sprint[] }
  | { type: "sprint"; sprint: Sprint }
  | { type: "decision"; decision: Decision };

export interface StartSprintOpts {
  userId: string;
  title: string;
  inboxItemId?: string;
  /** Injected so the Think stage can run a brain-first lookup (the contract). */
  brain: GbrainClient;
  scope: BrainScopeCtx;
}

/**
 * The execution engine. The simulated engine (local/test) and the live
 * Agent-SDK engine implement this, so the BFF and board are identical against
 * either.
 */
export interface SprintEngine {
  readonly kind: "agent" | "simulated";
  start(opts: StartSprintOpts): Promise<Sprint>;
  get(userId: string, id: string): Sprint | null;
  list(userId: string): Sprint[];
  /** Subscribe to live events; returns an unsubscribe fn. */
  on(listener: (e: SprintEvent) => void): () => void;
  /** Test/await helper: resolves when a sprint reaches a terminal state. */
  settle(userId: string, id: string): Promise<Sprint | null>;

  /** Open + recently-resolved decision forks for a user. */
  listDecisions(userId: string): Decision[];
  /** Resolve a fork → the sprint resumes. */
  resolveDecision(
    userId: string,
    id: string,
    resolution: DecisionResolution,
    optionId?: string,
  ): Decision | null;
}
