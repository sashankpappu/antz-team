"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Flag {
  kind: "contradiction" | "staleness";
  summary: string;
  pageSlugs: string[];
}
interface Item {
  id: string;
  title: string;
}
interface Briefing {
  date: string;
  generatedAt: string;
  shipped: Item[];
  running: Item[];
  holding: Item[];
  watch: Flag[];
  dream: { lastRunAt: string | null; nextScheduled: string };
  counts: { shipped: number; running: number; holding: number; captures: number };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "not yet run";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function Section({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">
        {title} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="text-sm text-ink">
              {i.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BriefingClient() {
  const [b, setB] = useState<Briefing | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/briefing");
    if (res.ok) setB((await res.json()).briefing);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDream() {
    setBusy(true);
    try {
      const res = await fetch("/api/briefing/dream", { method: "POST" });
      if (res.ok) setB((await res.json()).briefing);
    } finally {
      setBusy(false);
    }
  }

  if (!b) return <p className="text-sm text-muted">Composing your briefing…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ["Shipped", b.counts.shipped],
              ["Running", b.counts.running],
              ["Holding", b.counts.holding],
              ["Captured", b.counts.captures],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <div className="display text-3xl text-ink">{n}</div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-5">
          <Section title="Shipped" items={b.shipped} empty="Nothing shipped yet today." />
          <div className="border-t border-line pt-5">
            <Section title="Running" items={b.running} empty="No sprints in motion." />
          </div>
          <div className="border-t border-line pt-5">
            <Section title="Holding — needs you" items={b.holding} empty="Nothing waiting on you." />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium text-ink">What I&apos;d watch</p>
          {b.watch.length === 0 ? (
            <p className="text-sm text-muted">No contradictions or stale notes flagged.</p>
          ) : (
            <ul className="space-y-3">
              {b.watch.map((f, i) => (
                <li key={i} className="rounded-md border border-line bg-paper p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-accent">{f.kind}</p>
                  <p className="mt-1 text-sm text-ink">{f.summary}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">{f.pageSlugs.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Dream cycle</p>
            <p className="font-mono text-[11px] text-muted">
              last run {timeAgo(b.dream.lastRunAt)} · next {b.dream.nextScheduled}
            </p>
          </div>
          <Button variant="ghost" onClick={runDream} disabled={busy}>
            {busy ? "Dreaming…" : "Run dream cycle now"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
