import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok, workspaceFromParams } from '@/lib/api';
import { prisma } from '@/lib/db';
import { assignGapOwner, deferGap } from '@/lib/interview/gap-cache';

/**
 * Own or defer a gap. "I don't know — ask Ravi in IT" ends here: the gap gets
 * a name against it, and the interview moves on without pushing twice.
 */

const OwnSchema = z.object({
  action: z.enum(['own', 'defer']),
  ownerName: z.string().max(200).optional(),
  ownerRole: z.string().max(200).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; gapId: string }> },
) {
  try {
    const { gapId } = await params;
    const workspace = await workspaceFromParams(
      params as unknown as Promise<{ token: string }>,
    );
    const body = OwnSchema.parse(await request.json());

    // A share token must not be able to reach another workspace's gap.
    const gap = await prisma.gap.findFirst({
      where: { id: gapId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!gap) return ok({ error: 'No such question in this workspace.' }, 404);

    if (body.action === 'defer') return ok(await deferGap(gapId));

    if (!body.ownerName?.trim()) {
      return ok({ error: 'Give a name for who would know.' }, 400);
    }

    return ok(
      await assignGapOwner(gapId, {
        name: body.ownerName.trim(),
        role: body.ownerRole?.trim() || null,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
