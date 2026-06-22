import { auth } from "@/auth";
import { getGstack } from "@/lib/gstack";
import { audit } from "@/lib/store";
import { NextResponse } from "next/server";
import type { DecisionResolution } from "@/lib/gstack";

export const runtime = "nodejs";

/** Resolve a fork (approve / adjust / reject) → the sprint resumes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { resolution, optionId } = (await req.json().catch(() => ({}))) as {
    resolution?: DecisionResolution;
    optionId?: string;
  };
  if (!resolution || !["approve", "adjust", "reject"].includes(resolution)) {
    return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
  }

  const decision = getGstack().resolveDecision(session.user.id, id, resolution, optionId);
  if (!decision) return NextResponse.json({ error: "not found or already resolved" }, { status: 404 });

  audit({
    actor: session.user.id,
    action: `decision.${resolution}`,
    target: decision.id,
    scope: "gstack",
    citations: [],
  });

  return NextResponse.json({ decision });
}
