"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Eye, EyeOff } from "lucide-react";

type Source = "config" | "env" | "none";
interface SecretStatus {
  configured: boolean;
  last4: string | null;
  source: Source;
}
interface PublicConfig {
  values: Record<string, { value: string | null; source: Source }>;
  secrets: Record<string, SecretStatus>;
  allowedModels: string[];
  allowedEmbeddings: string[];
}

const SECRET_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "anthropicApiKey", label: "Anthropic API key", placeholder: "sk-ant-…" },
  { key: "zeroentropyApiKey", label: "ZeroEntropy API key" },
  { key: "openaiApiKey", label: "OpenAI API key" },
  { key: "voyageApiKey", label: "Voyage API key" },
  { key: "gbrainServiceToken", label: "gbrain service token" },
  { key: "databaseUrl", label: "Database URL", placeholder: "postgres://…" },
  { key: "entraId", label: "Microsoft Entra — client ID" },
  { key: "entraSecret", label: "Microsoft Entra — client secret" },
];

function StatusLine({ s }: { s: SecretStatus }) {
  if (!s.configured) return <span className="font-mono text-[11px] text-muted">not set</span>;
  return (
    <span className="font-mono text-[11px] text-shipped">
      configured ••••{s.last4} · via {s.source}
    </span>
  );
}

export function ConfigClient() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/config");
    if (!res.ok) return;
    const data = await res.json();
    const c: PublicConfig = data.config;
    setCfg(c);
    setCanEdit(data.canEdit);
    setValues({
      model: c.values.model.value ?? c.allowedModels[0],
      embeddingProvider: c.values.embeddingProvider.value ?? c.allowedEmbeddings[0],
      gbrainHttpUrl: c.values.gbrainHttpUrl.value ?? "",
      gstackLive: c.values.gstackLive.value === "true" ? "true" : "false",
      entraIssuer: c.values.entraIssuer.value ?? "",
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const secrets: Record<string, string> = {};
      for (const f of SECRET_FIELDS) {
        if (secretInputs[f.key]?.length) secrets[f.key] = secretInputs[f.key];
      }
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, secrets }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      const data = await res.json();
      setCfg(data.config);
      setSecretInputs({});
      setReveal({});
      setMessage(`Saved${data.changed?.length ? ` · ${data.changed.length} field(s)` : ""}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(key: string) {
    if (!canEdit) return;
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secrets: { [key]: null } }),
    });
    await load();
  }

  if (!cfg) return <p className="text-sm text-muted">Loading configuration…</p>;

  const inputCls =
    "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-60";

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Card className="border-needs/40">
          <CardBody>
            <p className="text-sm text-ink">
              You can view configuration but not change it. Editing requires the{" "}
              <span className="font-mono">admin</span> role.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Model & providers */}
      <Card>
        <CardBody className="space-y-4">
          <p className="text-sm font-medium text-ink">Model &amp; providers</p>

          <label className="block">
            <span className="text-sm text-muted">Default model</span>
            <select
              className={inputCls}
              value={values.model ?? ""}
              disabled={!canEdit}
              onChange={(e) => setValues((v) => ({ ...v, model: e.target.value }))}
            >
              {cfg.allowedModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-muted">Embeddings &amp; reranker provider</span>
            <select
              className={inputCls}
              value={values.embeddingProvider ?? ""}
              disabled={!canEdit}
              onChange={(e) => setValues((v) => ({ ...v, embeddingProvider: e.target.value }))}
            >
              {cfg.allowedEmbeddings.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-muted">Execution engine</span>
            <select
              className={inputCls}
              value={values.gstackLive ?? "false"}
              disabled={!canEdit}
              onChange={(e) => setValues((v) => ({ ...v, gstackLive: e.target.value }))}
            >
              <option value="false">Simulated (local)</option>
              <option value="true">Live gstack (needs Anthropic auth)</option>
            </select>
          </label>
        </CardBody>
      </Card>

      {/* Connections */}
      <Card>
        <CardBody className="space-y-4">
          <p className="text-sm font-medium text-ink">Connections</p>
          <label className="block">
            <span className="text-sm text-muted">gbrain HTTP URL</span>
            <input
              className={inputCls}
              type="text"
              placeholder="http://localhost:8787"
              value={values.gbrainHttpUrl ?? ""}
              disabled={!canEdit}
              onChange={(e) => setValues((v) => ({ ...v, gbrainHttpUrl: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Microsoft Entra issuer URL</span>
            <input
              className={inputCls}
              type="text"
              placeholder="https://login.microsoftonline.com/<tenant>/v2.0"
              value={values.entraIssuer ?? ""}
              disabled={!canEdit}
              onChange={(e) => setValues((v) => ({ ...v, entraIssuer: e.target.value }))}
            />
          </label>
        </CardBody>
      </Card>

      {/* Secrets */}
      <Card>
        <CardBody className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink">Keys &amp; secrets</p>
            <p className="mt-1 text-xs text-muted">
              Stored values are write-only and encrypted at rest — they&apos;re never shown
              back. Leave a field blank to keep the current value. The eye reveals what
              you&apos;re typing.
            </p>
          </div>

          {SECRET_FIELDS.map((f) => {
            const status = cfg.secrets[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">{f.label}</span>
                  <StatusLine s={status} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      className={cn(inputCls, "pr-10")}
                      type={reveal[f.key] ? "text" : "password"}
                      placeholder={status.configured ? "•••• leave blank to keep" : f.placeholder ?? "not set"}
                      autoComplete="off"
                      value={secretInputs[f.key] ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setSecretInputs((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                    <button
                      type="button"
                      aria-label={reveal[f.key] ? "Hide" : "Show"}
                      onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                    >
                      {reveal[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {canEdit && status.source === "config" && (
                    <button
                      type="button"
                      onClick={() => clearSecret(f.key)}
                      className="shrink-0 text-xs text-muted hover:text-needs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={!canEdit || saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
        {message && <span className="text-sm text-muted">{message}</span>}
      </div>
    </div>
  );
}
