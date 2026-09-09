'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'DECK' | 'TRANSCRIPT' | 'DOC' | 'CHAT';

/**
 * Seeding, which is the whole reason there is no cold start. By the time the
 * link goes out, the store already holds claims from whatever existed — so the
 * first question the exec sees is an informed one, never "tell me about your
 * idea".
 */
export function SeedForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; shareUrl: string } | null>(null);

  const [pasteKind, setPasteKind] = useState<Kind>('TRANSCRIPT');
  const [pasteLabel, setPasteLabel] = useState('');
  const [pasteRaw, setPasteRaw] = useState('');
  const [attest, setAttest] = useState(false);
  const [seeded, setSeeded] = useState<string[]>([]);

  const needsAttestation = pasteKind === 'TRANSCRIPT' || pasteKind === 'CHAT';

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, createdBy }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not create the workspace.');
      setCreated({ id: data.id, shareUrl: data.shareUrl });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addPaste(event: React.FormEvent) {
    event.preventDefault();
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      const token = created.shareUrl.split('/w/')[1];
      const response = await fetch(`/api/w/${token}/artifacts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: pasteLabel || `${pasteKind.toLowerCase()} paste`,
          raw: pasteRaw,
          kind: pasteKind,
          uploadedBy: createdBy,
          attestConsent: attest,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not ingest that.');
      setSeeded((prior) => [
        ...prior,
        `${pasteLabel || pasteKind.toLowerCase()} — ${data.claimsCreated} claims` +
          (data.conflictsRaised ? `, ${data.conflictsRaised} contradiction flagged` : ''),
      ]);
      setPasteRaw('');
      setPasteLabel('');
      setAttest(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !created) return;
    setBusy(true);
    setError(null);
    try {
      const token = created.shareUrl.split('/w/')[1];
      const form = new FormData();
      form.set('file', file);
      form.set('uploadedBy', createdBy);
      const response = await fetch(`/api/w/${token}/artifacts`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not read that file.');
      setSeeded((prior) => [...prior, `${file.name} — ${data.claimsCreated} claims`]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Seed a workspace
      </h2>

      {!created ? (
        <form onSubmit={createWorkspace} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-ink-soft">What is the process called</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Shortage escalation, Acme Manufacturing"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-soft">Your name</span>
            <input
              value={createdBy}
              onChange={(event) => setCreatedBy(event.target.value)}
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="rounded-md bg-paper p-3">
            <p className="text-xs text-ink-soft">Send this link</p>
            <code className="mt-1 block break-all text-sm">{created.shareUrl}</code>
            <p className="mt-2 text-xs text-ink-soft">
              Attach what already exists first. Every artifact you add now is one
              question the exec does not have to answer.
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-soft">Upload a deck, doc or PDF</p>
            <input
              type="file"
              onChange={addFile}
              disabled={busy}
              accept=".pdf,.docx,.pptx,.txt,.md,.csv,.vtt,.srt"
              className="mt-1 block w-full text-sm"
            />
          </div>

          <form onSubmit={addPaste} className="space-y-2 border-t border-line pt-4">
            <p className="text-xs text-ink-soft">Or paste a transcript, chat or email</p>
            <div className="flex gap-2">
              <select
                value={pasteKind}
                onChange={(event) => setPasteKind(event.target.value as Kind)}
                className="rounded-md border border-line px-2 py-1.5 text-sm"
              >
                <option value="TRANSCRIPT">Transcript</option>
                <option value="CHAT">Chat / email</option>
                <option value="DOC">Document</option>
                <option value="DECK">Deck notes</option>
              </select>
              <input
                value={pasteLabel}
                onChange={(event) => setPasteLabel(event.target.value)}
                placeholder="Where it came from"
                className="flex-1 rounded-md border border-line px-3 py-1.5 text-sm"
              />
            </div>
            <textarea
              value={pasteRaw}
              onChange={(event) => setPasteRaw(event.target.value)}
              rows={6}
              placeholder={'Ravi: the planner pulls the shortage list every Monday\nMeera: and emails procurement'}
              className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
            />
            {needsAttestation && (
              <label className="flex items-start gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={attest}
                  onChange={(event) => setAttest(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I had the right to share this. It contains other people&apos;s words.
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={busy || !pasteRaw.trim() || (needsAttestation && !attest)}
              className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {busy ? 'Extracting…' : 'Add and extract'}
            </button>
          </form>

          {seeded.length > 0 && (
            <ul className="space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
              {seeded.map((line) => (
                <li key={line}>✓ {line}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setSeeded([]);
              setName('');
            }}
            className="text-xs underline"
          >
            Seed another
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-flag">{error}</p>}
    </section>
  );
}
