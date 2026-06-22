"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface AuditEntry {
  id: string;
  action: string;
  target: string;
  scope: string;
  citations: string[];
  createdAt: string;
}
interface Govern {
  access: { role: string; scopes: string[]; login: string; readSources: string[]; writeSource: string };
  config: {
    model: string;
    embeddingProvider: string;
    keys: { anthropic: boolean; zeroentropy: boolean };
    gbrain: { connected: boolean };
    gstackLive: boolean;
  };
  cron: { dream: { lastRunAt: string | null; nextScheduled: string } };
  compliance: string[];
  audit: AuditEntry[];
}

function Dot({ on }: { on: boolean }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", on ? "bg-shipped" : "bg-muted")} aria-hidden />;
}

export function GovernClient() {
  const [g, setG] = useState<Govern | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/govern");
      if (res.ok) setG(await res.json());
    })();
  }, []);

  if (!g) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Access + brain scoping */}
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-ink">Your access &amp; brain scoping</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Role</dt>
            <dd className="font-mono text-ink">{g.access.role}</dd>
            <dt className="text-muted">gbrain scopes</dt>
            <dd className="font-mono text-ink">{g.access.scopes.join(" · ")}</dd>
            <dt className="text-muted">Reads from</dt>
            <dd className="font-mono text-ink">{g.access.readSources.join(" · ")}</dd>
            <dt className="text-muted">Writes to</dt>
            <dd className="font-mono text-ink">{g.access.writeSource}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Every brain read runs under your scope. Other users&apos; private sources are refused at
            the data layer — verified by the cross-user fuzz test.
          </p>
        </CardBody>
      </Card>

      {/* Config (masked) */}
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-ink">Configuration</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Model</dt>
            <dd className="font-mono text-ink">{g.config.model}</dd>
            <dt className="text-muted">Embeddings</dt>
            <dd className="font-mono text-ink">{g.config.embeddingProvider}</dd>
            <dt className="text-muted">Anthropic key</dt>
            <dd className="flex items-center gap-2 text-ink"><Dot on={g.config.keys.anthropic} /> {g.config.keys.anthropic ? "configured" : "not set"}</dd>
            <dt className="text-muted">ZeroEntropy key</dt>
            <dd className="flex items-center gap-2 text-ink"><Dot on={g.config.keys.zeroentropy} /> {g.config.keys.zeroentropy ? "configured" : "not set"}</dd>
            <dt className="text-muted">gbrain engine</dt>
            <dd className="flex items-center gap-2 text-ink"><Dot on={g.config.gbrain.connected} /> {g.config.gbrain.connected ? "live" : "in-memory"}</dd>
            <dt className="text-muted">gstack engine</dt>
            <dd className="flex items-center gap-2 text-ink"><Dot on={g.config.gstackLive} /> {g.config.gstackLive ? "live" : "simulated"}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted">Secrets are write-only and never sent to the browser.</p>
          <Link
            href="/config"
            className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-deep"
          >
            Edit configuration →
          </Link>
        </CardBody>
      </Card>

      {/* Cron + compliance */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-ink">Scheduled jobs</p>
            <p className="mt-2 text-sm text-ink">Dream cycle (nightly enrichment)</p>
            <p className="font-mono text-[11px] text-muted">
              next {g.cron.dream.nextScheduled} · last {g.cron.dream.lastRunAt ?? "not yet run"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-ink">Compliance</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.compliance.map((c) => (
                <span key={c} className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted">
                  {c}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Audit trail */}
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-ink">Audit &amp; citations</p>
          <p className="mt-1 text-xs text-muted">Append-only. Every brain answer and state change is logged with its source pages.</p>
          {g.audit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {g.audit.map((a) => (
                <li key={a.id} className="font-mono text-[11px] text-muted">
                  <span className="text-accent">{a.action}</span> · {a.target.slice(0, 40)}
                  {a.citations.length > 0 && <span> · cites {a.citations.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
