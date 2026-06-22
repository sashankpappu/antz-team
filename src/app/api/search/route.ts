import { auth } from "@/auth";
import { getGbrain, scopeForSession } from "@/lib/gbrain";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Raw hybrid search — the toggle behind the synthesized Ask answer. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "empty query" }, { status: 400 });
  }

  const scope = scopeForSession(session);
  const hits = await getGbrain().search(scope, query, 8);
  return NextResponse.json({ hits });
}
