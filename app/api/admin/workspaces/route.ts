import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { prisma } from '@/lib/db';
import { createWorkspace, shareUrlFor } from '@/lib/workspace';

/**
 * Seeding. An Antz team member creates the workspace and gets a link to send.
 *
 * There is no auth gate on this route in v1 — a deliberate decision recorded in
 * docs/DECISIONS.md (D4), with the risk stated there and in the README. Anyone
 * who can reach this host can create a workspace and list the share links of
 * every existing one.
 */

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  createdBy: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const body = CreateSchema.parse(await request.json());
    const workspace = await createWorkspace(body);
    return ok(workspace, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        createdBy: true,
        shareToken: true,
        status: true,
        overallPct: true,
        createdAt: true,
        expiresAt: true,
        _count: { select: { artifacts: true, claims: true, turns: true, conflicts: true } },
      },
    });

    return ok(
      workspaces.map((workspace) => ({
        ...workspace,
        shareUrl: shareUrlFor(workspace.shareToken),
      })),
    );
  } catch (error) {
    return fail(error);
  }
}
