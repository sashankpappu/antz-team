import { auth } from "@/auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import { getGstack } from "@/lib/gstack";
import { audit, setItemState } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** List the signed-in user's sprints. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ sprints: getGstack().list(session.user.id) });
}

/** Triage → DO: spin a gstack sprint. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, inboxItemId } = (await req.json().catch(() => ({}))) as {
    title?: string;
    inboxItemId?: string;
  };
  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const sprint = await getGstack().start({
    userId: session.user.id,
    title: title.trim(),
    inboxItemId,
    brain: getGbrain(),
    scope: scopeForSession(session),
  });

  // Triage state: the input is now in motion.
  if (inboxItemId) setItemState(session.user.id, inboxItemId, "motion");

  audit({
    actor: session.user.id,
    action: "sprint.start",
    target: sprint.id,
    scope: "gstack",
    citations: [],
  });

  return NextResponse.json({ sprint });
}
