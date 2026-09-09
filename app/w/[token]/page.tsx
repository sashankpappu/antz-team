import { notFound } from 'next/navigation';
import { ShareLinkExpiredError, WorkspaceNotFoundError, resolveShareToken } from '@/lib/workspace';
import { Session } from './session';

export const dynamic = 'force-dynamic';

/**
 * The customer session. The link is the only credential — there is no login
 * for the business user, by design.
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const workspace = await resolveShareToken(token);
    return <Session token={token} workspaceName={workspace.name} />;
  } catch (error) {
    if (error instanceof ShareLinkExpiredError) {
      return (
        <main className="mx-auto max-w-xl px-6 py-24">
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="mt-3 text-sm text-ink-soft">
            Ask whoever sent it for a fresh one. Nothing you said before has been
            lost.
          </p>
        </main>
      );
    }
    if (error instanceof WorkspaceNotFoundError) notFound();
    throw error;
  }
}
