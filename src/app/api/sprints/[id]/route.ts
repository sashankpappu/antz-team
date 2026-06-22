import { auth } from "@/auth";
import { getGstack } from "@/lib/gstack";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** A single sprint with its artifacts + log. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sprint = getGstack().get(session.user.id, id);
  if (!sprint) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ sprint });
}
