import { auth } from "@/auth";
import { listInbox } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The unified inbox stream for the signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ items: listInbox(session.user.id) });
}
