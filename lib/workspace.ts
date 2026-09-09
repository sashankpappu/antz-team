import { randomBytes } from 'node:crypto';
import { WorkspaceStatus } from '@prisma/client';
import { config, shareLinkExpiryFromNow } from '@/lib/config';
import { prisma } from '@/lib/db';

/**
 * Workspaces and share links.
 *
 * There is no customer self-signup and no login for the business user: an Antz
 * team member seeds the workspace and sends a link. The link is the only
 * credential, so it is generated from a CSPRNG at full length rather than from
 * anything guessable, and it can carry an expiry.
 */

export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super('That link is not valid.');
    this.name = 'WorkspaceNotFoundError';
  }
}

export class ShareLinkExpiredError extends Error {
  constructor() {
    super('That link has expired. Ask whoever sent it for a fresh one.');
    this.name = 'ShareLinkExpiredError';
  }
}

export async function createWorkspace(input: {
  name: string;
  createdBy: string;
}): Promise<{ id: string; shareToken: string; shareUrl: string }> {
  const shareToken = newShareToken();

  const workspace = await prisma.workspace.create({
    data: {
      name: input.name.trim(),
      createdBy: input.createdBy.trim(),
      shareToken,
      status: WorkspaceStatus.SEEDED,
      expiresAt: shareLinkExpiryFromNow(),
    },
    select: { id: true, shareToken: true },
  });

  return {
    ...workspace,
    shareUrl: `${config.appBaseUrl.replace(/\/$/, '')}/w/${workspace.shareToken}`,
  };
}

/** Resolve a share token to a workspace id, rejecting expired links. */
export async function resolveShareToken(token: string): Promise<{ id: string; name: string }> {
  const workspace = await prisma.workspace.findUnique({
    where: { shareToken: token },
    select: { id: true, name: true, expiresAt: true },
  });

  if (!workspace) throw new WorkspaceNotFoundError();
  if (workspace.expiresAt && workspace.expiresAt.getTime() < Date.now()) {
    throw new ShareLinkExpiredError();
  }

  return { id: workspace.id, name: workspace.name };
}

export function shareUrlFor(token: string): string {
  return `${config.appBaseUrl.replace(/\/$/, '')}/w/${token}`;
}
