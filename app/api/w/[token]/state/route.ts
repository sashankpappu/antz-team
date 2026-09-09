import { fail, ok, workspaceFromParams } from '@/lib/api';
import { prisma } from '@/lib/db';
import { COMMANDS } from '@/lib/skills';
import { gapRegister, nextGap } from '@/lib/interview/gap-cache';

/** Everything the session UI needs to draw itself, in one read. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const workspace = await workspaceFromParams(params);

    const [record, scores, gaps, pending, turns, artifacts, conflictCount] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspace.id },
        select: {
          name: true,
          status: true,
          overallPct: true,
          gapsComputedAt: true,
          inferredRole: true,
          inferredDomain: true,
        },
      }),
      prisma.score.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { dimension: 'asc' },
        select: { dimension: true, pct: true },
      }),
      gapRegister(workspace.id),
      nextGap(workspace.id),
      prisma.turn.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true, medium: true },
      }),
      prisma.artifact.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { uploadedAt: 'asc' },
        select: { id: true, filename: true, kind: true, uploadedAt: true },
      }),
      prisma.conflict.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
    ]);

    return ok({
      workspace: { ...record, name: record.name },
      scores,
      gaps: gaps.map((gap) => ({
        id: gap.id,
        dimension: gap.dimension,
        slot: gap.slot,
        question: gap.questionText,
        status: gap.status,
        ownerName: gap.ownerName,
        ownerRole: gap.ownerRole,
        blocking: gap.blocking,
      })),
      nextQuestion: pending
        ? {
            gapId: pending.id,
            dimension: pending.dimension,
            slot: pending.slot,
            question: pending.questionText,
            blocking: pending.blocking,
          }
        : null,
      turns,
      artifacts,
      openConflicts: conflictCount,
      commands: COMMANDS,
    });
  } catch (error) {
    return fail(error);
  }
}
