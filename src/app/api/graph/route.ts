import { auth } from "@/auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The knowledge graph, scoped to the signed-in user's sources. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const graph = await getGbrain().graph(scopeForSession(session));
  return NextResponse.json({ graph });
}
