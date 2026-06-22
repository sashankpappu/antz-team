"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainAnswer, type AnswerView } from "@/components/brain-answer";
import { cn } from "@/lib/cn";

interface SearchHit {
  pageSlug: string;
  title: string;
  snippet: string;
  score: number;
  source: string;
}

type Mode = "think" | "search";

export function AskBox() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("think");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AnswerView | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setHits(null);
    try {
      if (mode === "think") {
        const res = await fetch("/api/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "think failed");
        setAnswer(await res.json());
      } else {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "search failed");
        setHits((await res.json()).hits ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex gap-1 text-sm">
            {(["think", "search"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  mode === m ? "bg-accent-tint text-accent-deep" : "text-muted hover:text-ink",
                )}
              >
                {m === "think" ? "Synthesize" : "Raw search"}
              </button>
            ))}
          </div>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void ask();
            }}
            rows={2}
            placeholder="Ask the brain — e.g. What do we know about Alice at Acme?"
            className="w-full resize-none bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
          <div className="flex justify-end">
            <Button onClick={ask} disabled={busy || !q.trim()}>
              {busy ? "Thinking…" : "Ask"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-needs">{error}</p>}

      {answer && (
        <Card>
          <CardBody>
            <BrainAnswer view={answer} emptyLabel="The brain has nothing on this yet." />
          </CardBody>
        </Card>
      )}

      {hits && (
        <Card>
          <CardBody>
            {hits.length === 0 ? (
              <p className="text-sm text-muted">No pages matched.</p>
            ) : (
              <ul className="space-y-4">
                {hits.map((h) => (
                  <li key={h.pageSlug}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{h.title}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {h.source} · {(h.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{h.snippet}</p>
                    <p className="mt-1 font-mono text-[11px] text-accent">{h.pageSlug}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
