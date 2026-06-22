"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface DecisionOption {
  id: string;
  label: string;
  detail: string;
}
interface Decision {
  id: string;
  sprintId: string;
  type: "taste" | "scope" | "risk" | "security";
  summary: string;
  recommendation: string;
  options: DecisionOption[];
  recommendedOptionId: string;
  resolution?: "approve" | "adjust" | "reject";
  resolvedOptionId?: string;
  resolvedAt?: string;
}

export function DecisionsClient() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/decisions");
    if (res.ok) setDecisions((await res.json()).decisions ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    // The sprint stream also carries decision events — refetch on any.
    const es = new EventSource("/api/sprints/stream");
    es.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data).type === "decision") void refresh();
      } catch {
        /* heartbeat */
      }
    };
    return () => es.close();
  }, [refresh]);

  async function resolve(
    id: string,
    resolution: "approve" | "adjust" | "reject",
    optionId?: string,
  ) {
    if (busy) return;
    setBusy(id);
    try {
      await fetch(`/api/decisions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, optionId }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const open = decisions.filter((d) => !d.resolution);
  const resolved = decisions.filter((d) => d.resolution);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {open.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing needs you right now. Forks appear here when a sprint hits a taste,
            scope, risk, or security decision.
          </p>
        ) : (
          open.map((d) => {
            const recommended = d.options.find((o) => o.id === d.recommendedOptionId);
            const others = d.options.filter((o) => o.id !== d.recommendedOptionId);
            return (
              // Gold (`needs`) appears ONLY here — a fork is waiting (§6).
              <Card key={d.id} className="border-needs/50">
                <CardBody className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-needs/15 px-2.5 py-1 text-xs font-medium text-needs">
                      {d.type} · needs you
                    </span>
                  </div>
                  <p className="text-[15px] text-ink">{d.summary}</p>

                  <div className="space-y-2">
                    {d.options.map((o) => (
                      <div
                        key={o.id}
                        className={cn(
                          "rounded-md border p-3",
                          o.id === d.recommendedOptionId ? "border-needs/40 bg-paper" : "border-line",
                        )}
                      >
                        <p className="text-sm font-medium text-ink">
                          {o.label}
                          {o.id === d.recommendedOptionId && (
                            <span className="ml-2 font-mono text-[10px] uppercase text-needs">recommended</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">{o.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md bg-needs/10 px-3 py-2 text-sm text-ink">
                    <span className="font-medium">Crew recommends:</span> {d.recommendation}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="needs"
                      disabled={busy === d.id}
                      onClick={() => resolve(d.id, "approve", recommended?.id)}
                    >
                      Approve — {recommended?.label}
                    </Button>
                    {others.map((o) => (
                      <Button
                        key={o.id}
                        variant="ghost"
                        disabled={busy === d.id}
                        onClick={() => resolve(d.id, "adjust", o.id)}
                      >
                        Adjust → {o.label}
                      </Button>
                    ))}
                    <Button variant="ghost" disabled={busy === d.id} onClick={() => resolve(d.id, "reject")}>
                      Reject
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted">Resolved</h2>
          <ul className="space-y-2">
            {resolved.map((d) => (
              <li key={d.id}>
                <Card>
                  <CardBody className="flex items-center justify-between gap-3 py-4">
                    <p className="min-w-0 truncate text-sm text-ink">{d.summary}</p>
                    <span className="shrink-0 font-mono text-[11px] uppercase text-shipped">
                      {d.resolution}
                    </span>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
