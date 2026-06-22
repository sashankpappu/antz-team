"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainAnswer, type AnswerView } from "@/components/brain-answer";
import { cn } from "@/lib/cn";
import { Mic, Paperclip } from "lucide-react";

interface InboxItem {
  id: string;
  rawText: string;
  kind: string;
  route: "know" | "do";
  state: string;
  capturedAt: string;
  sourceChannel: string;
}

interface CaptureResult {
  signal: { kind: string; route: "know" | "do"; confidence: number; rationale: string };
  recall: AnswerView;
  deduped: boolean;
}

export function CaptureClient() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refreshInbox() {
    const res = await fetch("/api/inbox");
    if (res.ok) setItems((await res.json()).items ?? []);
  }

  useEffect(() => {
    void refreshInbox();
  }, []);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "capture failed");
      setResult(await res.json());
      setText("");
      await refreshInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
            }}
            rows={4}
            placeholder="What's on your mind? An idea, an email to act on, a bug, a decision…"
            className="w-full resize-none bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <div className="flex items-center gap-1 text-muted">
              <span className="rounded-md p-2" aria-hidden><Paperclip className="h-4 w-4" /></span>
              <span className="rounded-md p-2" aria-hidden><Mic className="h-4 w-4" /></span>
              <span className="ml-1 hidden font-mono text-[11px] uppercase tracking-wide sm:inline">
                ⌘↵ to send · paste · voice · email
              </span>
            </div>
            <Button onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "Reading…" : "Hand it to Vidur"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-needs">{error}</p>}

      {result && (
        <Card>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  result.signal.route === "do"
                    ? "bg-accent-tint text-accent-deep"
                    : "bg-paper text-muted",
                )}
              >
                {result.signal.kind} · {result.signal.route}
              </span>
              <span className="font-mono text-[11px] text-muted">
                {Math.round(result.signal.confidence * 100)}% confidence
              </span>
              {result.deduped && (
                <span className="font-mono text-[11px] text-muted">· already captured</span>
              )}
            </div>
            <p className="text-sm text-muted">{result.signal.rationale}</p>

            <div className="border-t border-line pt-5">
              <p className="mb-3 text-sm font-medium text-ink">Here&apos;s what you already know</p>
              <BrainAnswer
                view={result.recall}
                emptyLabel="Nothing in the brain about this yet — it's new."
              />
            </div>
          </CardBody>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted">
          Inbox · {items.length}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nothing captured yet. Hand Vidur your first input above.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <Card>
                  <CardBody className="flex items-start gap-3 py-4">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        it.route === "do" ? "bg-accent" : "bg-muted",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{it.rawText}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">
                        {it.kind} · {it.state} · {it.sourceChannel}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
