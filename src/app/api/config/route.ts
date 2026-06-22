import { auth } from "@/auth";
import { getPublicConfig, updateConfig, type ConfigPatch } from "@/lib/settings";
import { audit } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Current configuration — masked. Secrets are never returned, only status. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    config: getPublicConfig(),
    canEdit: session.user.role === "admin",
  });
}

/** Update configuration. Admin only. Secret values are write-only. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "admin role required" }, { status: 403 });
  }

  const patch = (await req.json().catch(() => ({}))) as ConfigPatch;
  const { changed } = updateConfig(patch);

  // Audit field NAMES only — never values.
  audit({
    actor: session.user.id,
    action: "config.update",
    target: changed.join(",") || "(none)",
    scope: "config",
    citations: [],
  });

  return NextResponse.json({ config: getPublicConfig(), changed });
}
