import type { Session } from "next-auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import type { BrainFlag } from "@/lib/gbrain";
import { getGstack } from "@/lib/gstack";
import { getDreamRun, listInbox } from "@/lib/store";

/**
 * The morning briefing (§4): a one-screen read of what shipped, what's holding,
 * what's running, and what to watch. Composed from live sprint + decision state
 * and the brain's dream-cycle flags. The brain is the source of "what to watch";
 * everything cited stays honest about where it came from.
 */
export interface BriefingItem {
  id: string;
  title: string;
}

export interface BriefingPayload {
  date: string;
  generatedAt: string;
  shipped: BriefingItem[];
  running: BriefingItem[];
  /** Blocked sprints + open forks — the things holding on a human. */
  holding: BriefingItem[];
  /** Contradiction + staleness flags from the dream cycle. */
  watch: BrainFlag[];
  dream: {
    lastRunAt: string | null;
    /** Nightly schedule (cron lands in Phase 5 Govern). */
    nextScheduled: string;
  };
  counts: { shipped: number; running: number; holding: number; captures: number };
}

export async function buildBriefing(session: Session): Promise<BriefingPayload> {
  const userId = session.user.id;
  const scope = scopeForSession(session);
  const gstack = getGstack();
  const brain = getGbrain();

  const sprints = gstack.list(userId);
  const decisions = gstack.listDecisions(userId).filter((d) => !d.resolution);
  const watch = await brain.flags(scope);

  const shipped = sprints.filter((s) => s.status === "shipped").map((s) => ({ id: s.id, title: s.title }));
  const running = sprints.filter((s) => s.status === "running").map((s) => ({ id: s.id, title: s.title }));
  const holding = [
    ...sprints.filter((s) => s.status === "blocked").map((s) => ({ id: s.id, title: `${s.title} — blocked on a decision` })),
    ...decisions.map((d) => ({ id: d.id, title: `${d.type} fork — ${d.summary}` })),
  ];

  return {
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    shipped,
    running,
    holding,
    watch,
    dream: {
      lastRunAt: getDreamRun(userId),
      nextScheduled: "tonight · 02:00 local",
    },
    counts: {
      shipped: shipped.length,
      running: running.length,
      holding: holding.length,
      captures: listInbox(userId).length,
    },
  };
}
