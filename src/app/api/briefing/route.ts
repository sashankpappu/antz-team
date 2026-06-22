import { auth } from "@/auth";
import { buildBriefing } from "@/lib/briefing";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Today's morning briefing for the signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ briefing: await buildBriefing(session) });
}
