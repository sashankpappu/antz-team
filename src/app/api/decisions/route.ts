import { auth } from "@/auth";
import { getGstack } from "@/lib/gstack";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The human-only forks queue for the signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ decisions: getGstack().listDecisions(session.user.id) });
}
