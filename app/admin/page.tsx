import Link from 'next/link';
import { prisma } from '@/lib/db';
import { shareUrlFor } from '@/lib/workspace';
import { config } from '@/lib/config';
import { isStorageConfigured } from '@/lib/storage';
import { isModelConfigured } from '@/lib/anthropic';
import { SeedForm } from './seed-form';

export const dynamic = 'force-dynamic';

/**
 * Seeding and review.
 *
 * No auth gate in v1 — a deliberate decision (docs/DECISIONS.md D4). Anyone who
 * can reach this host can create a workspace and read every share link on this
 * page. The banner below says so rather than letting an operator assume
 * otherwise.
 */
export default async function AdminPage() {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      createdBy: true,
      shareToken: true,
      status: true,
      overallPct: true,
      createdAt: true,
      _count: { select: { artifacts: true, claims: true, turns: true, conflicts: true } },
      // An artifact with no extractedAt was stored but never turned into
      // claims — usually because extraction failed. It would otherwise sit in
      // the provenance log contributing nothing, and nobody would know.
      artifacts: {
        where: { extractedAt: null },
        select: { id: true, filename: true },
      },
    },
  });

  const storageReady = isStorageConfigured();
  const modelReady = isModelConfigured();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Intake — seeding</h1>
        <Link href="/" className="text-xs text-ink-soft underline">
          home
        </Link>
      </header>

      <p className="mt-3 rounded-md border border-flag/40 bg-flag/5 px-3 py-2 text-xs text-flag">
        This page is unauthenticated. Every share link below is readable by anyone
        who can reach this host — put it behind your own network controls before
        using it with a real customer.
      </p>

      {(!storageReady || !modelReady) && (
        <ul className="mt-3 space-y-1 rounded-md border border-line bg-white px-3 py-2 text-xs text-ink-soft">
          {!storageReady && (
            <li>
              <strong>No storage configured.</strong> File uploads will be refused.
              Set <code>STORAGE_DRIVER</code> to <code>local</code> or <code>s3</code>.
              Pastes still work.
            </li>
          )}
          {!modelReady && (
            <li>
              <strong>No <code>ANTHROPIC_API_KEY</code>.</strong> Ingest will fail and
              questions fall back to the ontology&apos;s own wording.
            </li>
          )}
        </ul>
      )}

      <div className="mt-8">
        <SeedForm />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Workspaces
        </h2>

        {workspaces.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {workspaces.map((workspace) => (
              <li key={workspace.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{workspace.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      seeded by {workspace.createdBy} ·{' '}
                      {workspace.createdAt.toISOString().slice(0, 10)} ·{' '}
                      {workspace.status.toLowerCase().replace(/_/g, ' ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {workspace.overallPct}%
                  </span>
                </div>

                <p className="mt-2 text-xs text-ink-soft">
                  {workspace._count.artifacts} artifacts · {workspace._count.claims} claims ·{' '}
                  {workspace._count.turns} turns
                  {workspace._count.conflicts > 0 && (
                    <span className="text-flag">
                      {' '}
                      · {workspace._count.conflicts} contradiction
                      {workspace._count.conflicts === 1 ? '' : 's'}
                    </span>
                  )}
                </p>

                {workspace.artifacts.length > 0 && (
                  <p className="mt-1 text-xs text-flag">
                    Not extracted, so contributing nothing:{' '}
                    {workspace.artifacts.map((artifact) => artifact.filename).join(', ')}. Re-upload
                    it once the cause is fixed.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link href={`/w/${workspace.shareToken}`} className="underline">
                    open session
                  </Link>
                  <a
                    href={`/api/w/${workspace.shareToken}/render?view=brd&download=1`}
                    className="underline"
                  >
                    download BRD
                  </a>
                  <a
                    href={`/api/w/${workspace.shareToken}/render?view=architecture&download=1`}
                    className="underline"
                  >
                    architecture
                  </a>
                  <code className="break-all text-ink-soft">
                    {shareUrlFor(workspace.shareToken)}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 text-xs text-ink-soft">
        Artifacts stored via <code>{config.storage.driver}</code>
        {config.artifactRetentionDays !== null
          ? `, raw material purgeable after ${config.artifactRetentionDays} days`
          : ', retained indefinitely'}
        . Audio ingest {config.ingest.audioEnabled ? 'enabled' : 'disabled'}. Voice{' '}
        {config.voice.driver === 'none' ? 'not implemented (Phase 2)' : config.voice.driver}.
      </footer>
    </main>
  );
}
