import { auth } from "@/auth";
import { buildBriefing } from "@/lib/briefing";
import { audit, recordDreamRun } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Run the dream cycle now. The nightly cron (Phase 5 Govern) calls the same
 * path; here it's a manual trigger so the briefing can be refreshed on demand.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ranAt = recordDreamRun(session.user.id);
  audit({ actor: session.user.id, action: "dream.run", target: ranAt, scope: "gbrain", citations: [] });

  return NextResponse.json({ ranAt, briefing: await buildBriefing(session) });
}
