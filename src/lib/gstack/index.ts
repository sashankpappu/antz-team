import { SimulatedSprintEngine } from "./simulated-engine";
import type { SprintEngine } from "./types";

export type {
  Sprint,
  Stage,
  SprintEvent,
  Artifact,
  LogEntry,
  Decision,
  DecisionType,
  DecisionResolution,
  DecisionOption,
} from "./types";
export { STAGES } from "./types";

/**
 * Execution engine for this process.
 *
 * Phase 2 ships the simulated engine — a fully-working 7-stage pipeline whose
 * Think stage runs the real brain-first lookup (the integration contract). The
 * `SprintEngine` interface is the seam: a live engine that drives real gstack
 * via the Claude Agent SDK (slash-command sprint, streamed stage transitions)
 * drops in behind the same interface. It is gated on `GSTACK_LIVE=true` plus an
 * Anthropic key, and is verified in a keyed environment before being enabled —
 * until then we run simulated rather than ship an unverified live path.
 */
declare global {
  // eslint-disable-next-line no-var
  var __vidurGstack: SprintEngine | undefined;
}

function build(): SprintEngine {
  const simulated = new SimulatedSprintEngine();
  if (process.env.GSTACK_LIVE === "true" && process.env.ANTHROPIC_API_KEY) {
    // Live Agent-SDK engine slots in here once verified in a keyed env.
    console.warn("[gstack] GSTACK_LIVE set but live engine not yet enabled — using simulated.");
  }
  return simulated;
}

export function getGstack(): SprintEngine {
  if (!globalThis.__vidurGstack) globalThis.__vidurGstack = build();
  return globalThis.__vidurGstack;
}
