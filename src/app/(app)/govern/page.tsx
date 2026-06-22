import { auth } from "@/auth";
import { scopesForRole } from "@/lib/rbac";
import { Surface, Planned } from "@/components/surface";
import { Card, CardBody } from "@/components/ui/card";

export default async function GovernPage() {
  const session = await auth();
  const role = session?.user?.role ?? "viewer";
  const scopes = scopesForRole(role);

  return (
    <Surface title="Govern" blurb="Team, brain scoping, audit & config." phase="Phase 1 · 5">
      <Card className="mb-6">
        <CardBody>
          <p className="text-sm font-medium text-ink">Your access</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Role</dt>
            <dd className="font-mono text-ink">{role}</dd>
            <dt className="text-muted">gbrain scopes</dt>
            <dd className="font-mono text-ink">{scopes.join(" · ")}</dd>
            <dt className="text-muted">Login slice</dt>
            <dd className="truncate font-mono text-ink">{session?.user?.gbrainLogin ?? "—"}</dd>
          </dl>
        </CardBody>
      </Card>

      <Planned
        points={[
          "Config page: Anthropic model tier, embedding/reranker provider, API keys.",
          "Team membership + per-user brain scoping (viewer / member / admin).",
          "Append-only citation & audit trail for every brain answer and state change.",
          "Cron-job visibility + data-residency settings (DPDP / GDPR / SOC 2).",
        ]}
      />
    </Surface>
  );
}
