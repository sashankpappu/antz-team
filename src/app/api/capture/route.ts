import { auth } from "@/auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import { detectSignal } from "@/lib/signal-detector";
import { audit, upsertCapture } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function deriveTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0] ?? "Capture";
  return firstLine.replace(/^(subject|from|to):\s*/i, "").slice(0, 72) || "Capture";
}

/**
 * Capture → the brain reads it first → propose a route (§1 loop).
 * Order matters: recall runs against existing knowledge BEFORE this capture is
 * written, so "here's what you already know" reflects prior memory, not the
 * note just pasted.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text, channel = "paste" } = (await req.json().catch(() => ({}))) as {
    text?: string;
    channel?: string;
  };
  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "empty capture" }, { status: 400 });
  }

  const scope = scopeForSession(session);
  const brain = getGbrain();
  const signal = detectSignal(text);

  // Brain-first recall: what do we already know + what's still open.
  const recall = await brain.think(scope, text);

  // Persist the capture into the brain as a page (idempotent on slug).
  const page = await brain.putPage(scope, { title: deriveTitle(text), body: text });

  const { item, deduped } = upsertCapture({
    userId: session.user.id,
    rawText: text,
    sourceChannel: (["paste", "email", "voice", "teams", "whatsapp", "webhook"].includes(channel)
      ? channel
      : "paste") as never,
    kind: signal.kind,
    route: signal.route,
    state: signal.route === "do" ? "triaging" : "captured",
    brainPageSlug: page.slug,
  });

  // Every brain-derived statement is logged with its source pages (DoD).
  audit({
    actor: session.user.id,
    action: deduped ? "capture.dedupe" : "capture",
    target: item.id,
    scope: scope.readSources.join(","),
    citations: recall.citations.map((c) => c.pageSlug),
  });

  return NextResponse.json({
    item,
    deduped,
    signal,
    recall: {
      answer: recall.answer,
      citations: recall.citations,
      gaps: recall.gaps,
      pagesGathered: recall.pagesGathered,
      synthesisOk: recall.synthesisOk,
      degraded: recall.degraded ?? false,
    },
  });
}
