import { auth } from "@/auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import { getValue } from "@/lib/settings";
import { audit } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Ask box → gbrain `think`: synthesized answer + citations + gap note. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question || question.trim().length === 0) {
    return NextResponse.json({ error: "empty question" }, { status: 400 });
  }

  const scope = scopeForSession(session);
  const result = await getGbrain().think(scope, question, {
    model: getValue("model"),
  });

  audit({
    actor: session.user.id,
    action: "think",
    target: question.slice(0, 120),
    scope: scope.readSources.join(","),
    citations: result.citations.map((c) => c.pageSlug),
  });

  return NextResponse.json(result);
}
