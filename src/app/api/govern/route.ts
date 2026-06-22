import { auth } from "@/auth";
import { scopeForSession } from "@/lib/gbrain";
import { scopesForRole } from "@/lib/rbac";
import { getDreamRun, listAudit } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Govern data: the signed-in user's access + brain scoping, the (masked) config,
 * cron visibility, and the append-only audit trail. No secret values are ever
 * returned — only whether a key is configured.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scope = scopeForSession(session);
  const role = session.user.role;

  return NextResponse.json({
    access: {
      role,
      scopes: scopesForRole(role),
      login: session.user.gbrainLogin,
      readSources: scope.readSources,
      writeSource: scope.writeSource,
    },
    config: {
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "zeroentropy",
      keys: {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        zeroentropy: Boolean(process.env.ZEROENTROPY_API_KEY),
      },
      gbrain: { connected: Boolean(process.env.GBRAIN_HTTP_URL && process.env.GBRAIN_SERVICE_TOKEN) },
      gstackLive: process.env.GSTACK_LIVE === "true",
    },
    cron: {
      dream: { lastRunAt: getDreamRun(session.user.id), nextScheduled: "tonight · 02:00 local" },
    },
    compliance: ["DPDP", "GDPR", "SOC 2"],
    audit: listAudit(session.user.id).slice(-25).reverse(),
  });
}
