import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { STAGES, type Sprint, type SprintEngine, type SprintEvent, type Stage, type StartSprintOpts, type Artifact } from "./types";

/**
 * Simulated gstack engine — the zero-config local/test execution layer, and
 * the graceful-degradation path when live gstack is unreachable (§ guardrails:
 * sprints queue / run in sim rather than breaking the surface).
 *
 * It advances a sprint through the seven stages on a timer, emitting an event
 * after each transition so the Execute board updates live over SSE. The first
 * stage, Think, runs a real brain-first lookup against gbrain (the integration
 * contract) and records the recall — with citations — as the sprint's first
 * artifact, so the crew never re-solves a solved problem.
 */

const STEP_MS = Number(process.env.GSTACK_STEP_MS ?? 1200);

function stageArtifact(stage: Stage, title: string): Omit<Artifact, "id" | "createdAt"> {
  switch (stage) {
    case "plan":
      return { stage, kind: "plan", title: "Plan", body: `Scoped the work for "${title}" into milestones with an architecture note.` };
    case "design":
      return { stage, kind: "design", title: "Design", body: "Two design directions explored; the calmer one matches the design system." };
    case "build":
      return { stage, kind: "note", title: "Build", body: "Implemented the slice behind the existing interfaces; typecheck clean." };
    case "review":
      return { stage, kind: "note", title: "Review", body: "Paranoid review pass — no correctness or scoping regressions found." };
    case "test":
      return { stage, kind: "note", title: "Test", body: "Unit + a happy-path integration check; all green." };
    case "ship":
      return { stage, kind: "release", title: "Release notes", body: `Shipped "${title}". /retro + /learn will write the result back to the brain.` };
    default:
      return { stage, kind: "note", title: stage, body: "" };
  }
}

export class SimulatedSprintEngine implements SprintEngine {
  readonly kind = "simulated" as const;
  private sprints = new Map<string, Sprint>();
  private running = new Map<string, Promise<Sprint | null>>();
  private emitter = new EventEmitter();

  constructor(private readonly stepMs = STEP_MS) {
    this.emitter.setMaxListeners(100);
  }

  on(listener: (e: SprintEvent) => void): () => void {
    const h = (e: SprintEvent) => listener(e);
    this.emitter.on("event", h);
    return () => this.emitter.off("event", h);
  }

  get(userId: string, id: string): Sprint | null {
    const s = this.sprints.get(id);
    return s && s.userId === userId ? s : null;
  }

  list(userId: string): Sprint[] {
    return [...this.sprints.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  settle(userId: string, id: string): Promise<Sprint | null> {
    return this.running.get(id) ?? Promise.resolve(this.get(userId, id));
  }

  private touch(sprint: Sprint, message?: string) {
    sprint.updatedAt = new Date().toISOString();
    if (message) sprint.log.push({ at: sprint.updatedAt, stage: sprint.stage, message });
    this.emitter.emit("event", { type: "sprint", sprint: structuredClone(sprint) } satisfies SprintEvent);
  }

  async start(opts: StartSprintOpts): Promise<Sprint> {
    const now = new Date().toISOString();
    const sprint: Sprint = {
      id: randomUUID(),
      userId: opts.userId,
      title: opts.title,
      inboxItemId: opts.inboxItemId,
      stage: "think",
      status: "running",
      artifacts: [],
      log: [],
      startedAt: now,
      updatedAt: now,
    };
    this.sprints.set(sprint.id, sprint);
    this.touch(sprint, "Sprint started — Think stage running a brain-first lookup.");

    this.running.set(sprint.id, this.run(sprint, opts));
    return sprint;
  }

  private async run(sprint: Sprint, opts: StartSprintOpts): Promise<Sprint | null> {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Stage 1: Think — brain-first lookup (the integration contract).
    try {
      const recall = await opts.brain.think(opts.scope, sprint.title);
      sprint.artifacts.push({
        id: randomUUID(),
        stage: "think",
        kind: "brain-recall",
        title: "Brain-first recall",
        body: recall.synthesisOk
          ? recall.answer
          : "The brain had nothing prior on this — starting fresh.",
        citations: recall.citations,
        createdAt: new Date().toISOString(),
      });
      this.touch(
        sprint,
        recall.synthesisOk
          ? `Found ${recall.citations.length} prior source(s); not re-solving what's known.`
          : "No prior knowledge found; proceeding.",
      );
    } catch {
      this.touch(sprint, "Brain lookup unavailable; proceeding without prior recall.");
    }

    // Stages 2..7: advance on the timer, one artifact per stage.
    for (const stage of STAGES.slice(1) as Stage[]) {
      await delay(this.stepMs);
      sprint.stage = stage;
      const a = stageArtifact(stage, sprint.title);
      sprint.artifacts.push({ ...a, id: randomUUID(), createdAt: new Date().toISOString() });
      this.touch(sprint, `Entered ${stage}.`);
    }

    sprint.status = "shipped";
    this.touch(sprint, "Shipped.");
    return sprint;
  }
}
