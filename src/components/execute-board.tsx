"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainAnswer } from "@/components/brain-answer";
import { cn } from "@/lib/cn";

const STAGES = ["think", "plan", "design", "build", "review", "test", "ship"] as const;
type Stage = (typeof STAGES)[number];

interface Citation {
  pageSlug: string;
  rowNum: number | null;
  citationIndex?: number;
}
interface Artifact {
  id: string;
  stage: Stage;
  title: string;
  body: string;
  kind: string;
  citations?: Citation[];
  createdAt: string;
}
interface LogEntry {
  at: string;
  stage: Stage;
  message: string;
}
interface Sprint {
  id: string;
  title: string;
  stage: Stage;
  status: "running" | "shipped" | "blocked";
  artifacts: Artifact[];
  log: LogEntry[];
  startedAt: string;
}

export function ExecuteBoard() {
  const [sprints, setSprints] = useState<Record<string, Sprint>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/sprints/stream");
    esRef.current = es;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as
        | { type: "snapshot"; sprints: Sprint[] }
        | { type: "sprint"; sprint: Sprint };
      if (data.type === "snapshot") {
        setSprints(Object.fromEntries(data.sprints.map((s) => [s.id, s])));
      } else {
        setSprints((prev) => ({ ...prev, [data.sprint.id]: data.sprint }));
      }
    };
    return () => es.close();
  }, []);

  async function startSprint() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  const list = useMemo(
    () => Object.values(sprints).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sprints],
  );
  const active = selected ? sprints[selected] : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startSprint()}
            placeholder="Start a sprint — e.g. Draft the Acme pilot pricing page"
            className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
          <Button onClick={startSprint} disabled={busy || !title.trim()}>
            {busy ? "Spinning…" : "Start it"}
          </Button>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span className={cn("h-2 w-2 rounded-full", live ? "bg-shipped" : "bg-muted")} aria-hidden />
        {live ? "live" : "reconnecting"} · {list.length} sprint{list.length === 1 ? "" : "s"}
      </div>

      {/* 7-stage board. Horizontal scroll on small screens. */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[820px] grid-cols-7 gap-3">
          {STAGES.map((stage) => (
            <div key={stage} className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wide text-muted">{stage}</div>
              {list
                .filter((s) => s.stage === stage)
                .map((s) => {
                  const shipped = s.status === "shipped";
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                      className={cn(
                        "w-full rounded-md border bg-card p-3 text-left shadow-soft transition-colors hover:border-accent",
                        shipped ? "border-shipped/40" : "border-line",
                        selected === s.id && "border-accent",
                      )}
                    >
                      <p className="line-clamp-2 text-[13px] text-ink">{s.title}</p>
                      <p
                        className={cn(
                          "mt-1.5 font-mono text-[10px] uppercase",
                          shipped ? "text-shipped" : "text-accent",
                        )}
                      >
                        {shipped ? "shipped" : "running"}
                      </p>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <p className="text-sm text-muted">
          No sprints yet. Start one above, or tap “Start it” on a DO item in Capture.
        </p>
      )}

      {active && <SprintDetail sprint={active} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SprintDetail({ sprint, onClose }: { sprint: Sprint; onClose: () => void }) {
  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-ink">{sprint.title}</h3>
            <p className="mt-0.5 font-mono text-[11px] uppercase text-muted">
              {sprint.stage} · {sprint.status}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">Artifacts</p>
          <ul className="space-y-3">
            {sprint.artifacts.map((a) => (
              <li key={a.id} className="rounded-md border border-line bg-paper p-3">
                <p className="text-sm font-medium text-ink">
                  <span className="font-mono text-[10px] uppercase text-accent">{a.stage}</span> · {a.title}
                </p>
                {a.kind === "brain-recall" ? (
                  <div className="mt-2">
                    <BrainAnswer
                      view={{ answer: a.body, citations: a.citations ?? [], gaps: [] }}
                      emptyLabel="No prior knowledge."
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted">{a.body}</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">Log</p>
          <ul className="space-y-1">
            {sprint.log.map((l, i) => (
              <li key={i} className="font-mono text-[11px] text-muted">
                <span className="text-accent">{l.stage}</span> — {l.message}
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
