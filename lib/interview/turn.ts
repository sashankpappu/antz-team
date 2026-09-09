import { ArtifactKind, GapStatus, TurnMedium, TurnRole, WorkspaceStatus } from '@prisma/client';
import { extractClaims } from '@/lib/claims/extract';
import { storeClaims } from '@/lib/claims/store';
import type { VocabularyTerm } from '@/lib/claims/schemas';
import { prisma } from '@/lib/db';
import {
  assignGapOwner,
  markAnsweredIfFilled,
  markAsked,
  nextGapOrRebuild,
  refreshGapCache,
  scheduleGapRefresh,
} from './gap-cache';

/**
 * One turn of the interview.
 *
 * The order here is the whole design. We persist the answer, read the cached
 * next question, and reply. Extraction, scoring, ranking and question
 * generation all happen afterwards, in `deferred`, which the route runs after
 * the response has been flushed.
 *
 * Nothing between the exec finishing and the reply going out is allowed to
 * call a model or run the completeness engine.
 */

export type TurnKind = 'answer' | 'dont-know' | 'start';

export interface TurnRequest {
  workspaceId: string;
  kind: TurnKind;
  /** The exec's words. Empty for 'start' and for a bare 'dont-know'. */
  content?: string;
  medium?: TurnMedium;
  command?: string;
  /** For 'dont-know': who should be asked instead. */
  ownerName?: string;
  ownerRole?: string;
}

export interface TurnQuestion {
  gapId: string;
  dimension: string;
  slot: string;
  question: string;
  blocking: boolean;
}

export interface TurnResponse {
  reply: string;
  question: TurnQuestion | null;
  /** Set when we asked who would know and are waiting on a name. */
  awaitingOwnerForGapId: string | null;
  completeness: number;
  /** True when the register is empty — nothing left to ask. */
  exhausted: boolean;
}

export interface HandledTurn {
  response: TurnResponse;
  /** Run after the response is sent. Never awaited on the request path. */
  deferred: () => Promise<void>;
}

const NOTHING_LEFT =
  "That's everything I had to ask. I've written it up — open the summary to " +
  'check I understood it, and the gaps view for what still needs a name against it.';

export async function handleTurn(request: TurnRequest): Promise<HandledTurn> {
  const { workspaceId } = request;
  const medium = request.medium ?? TurnMedium.TEXT;

  // The gap that was on screen when the exec answered. Read before anything
  // else so an answer is attributed to the question that actually prompted it.
  const askedGap = await prisma.gap.findFirst({
    where: { workspaceId, status: GapStatus.OPEN, askedCount: { gt: 0 } },
    orderBy: { updatedAt: 'desc' },
  });

  if (request.kind === 'dont-know') {
    return handleDontKnow(request, askedGap?.id ?? null);
  }

  let userTurnId: string | null = null;

  if (request.kind === 'answer' && request.content?.trim()) {
    const turn = await prisma.turn.create({
      data: {
        workspaceId,
        role: TurnRole.USER,
        medium,
        content: request.content.trim(),
        command: request.command,
        askedDimension: askedGap?.dimension ?? null,
        askedSlot: askedGap?.slot ?? null,
      },
      select: { id: true },
    });
    userTurnId = turn.id;
  }

  // Cache read. This is the only thing between the answer and the reply —
  // except on the very first turn of an unseeded workspace, where there is no
  // cache to read yet (see nextGapOrRebuild).
  const gap = await nextGapOrRebuild(workspaceId);
  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { status: WorkspaceStatus.IN_SESSION },
    select: { overallPct: true },
  });

  if (!gap) {
    return {
      response: {
        reply: NOTHING_LEFT,
        question: null,
        awaitingOwnerForGapId: null,
        completeness: workspace.overallPct,
        exhausted: true,
      },
      deferred: async () => {
        await ingestAnswer(request, userTurnId, askedGap);
        await refreshGapCache(workspaceId);
      },
    };
  }

  await prisma.turn.create({
    data: {
      workspaceId,
      role: TurnRole.ASSISTANT,
      medium,
      content: gap.questionText,
      command: request.command,
      askedDimension: gap.dimension,
      askedSlot: gap.slot,
    },
  });
  await markAsked(gap.id);

  return {
    response: {
      reply: gap.questionText,
      question: {
        gapId: gap.id,
        dimension: gap.dimension,
        slot: gap.slot,
        question: gap.questionText,
        blocking: gap.blocking,
      },
      awaitingOwnerForGapId: null,
      completeness: workspace.overallPct,
      exhausted: false,
    },
    deferred: async () => {
      await ingestAnswer(request, userTurnId, askedGap);
      await refreshGapCache(workspaceId);
    },
  };
}

/**
 * "I don't know" is a first-class answer, not a failure.
 *
 * Without a name we ask once who would know. With a name the gap becomes owned
 * and tracked and we move straight on — we never push the same slot twice.
 */
async function handleDontKnow(
  request: TurnRequest,
  fallbackGapId: string | null,
): Promise<HandledTurn> {
  const { workspaceId } = request;
  const gapId = fallbackGapId;

  if (!gapId) {
    // Nothing was on screen to not know. Treat it as a normal turn.
    return handleTurn({ ...request, kind: 'answer' });
  }

  const medium = request.medium ?? TurnMedium.TEXT;

  if (!request.ownerName?.trim()) {
    const gap = await prisma.gap.findUnique({ where: { id: gapId } });
    const reply = gap
      ? `No problem. Who would know about ${gap.slot.replace(/_/g, ' ')} — their name and role?`
      : 'No problem. Who would know that — their name and role?';

    await prisma.turn.create({
      data: {
        workspaceId,
        role: TurnRole.ASSISTANT,
        medium,
        content: reply,
        askedDimension: gap?.dimension ?? null,
        askedSlot: gap?.slot ?? null,
      },
    });

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { overallPct: true },
    });

    return {
      response: {
        reply,
        question: null,
        awaitingOwnerForGapId: gapId,
        completeness: workspace.overallPct,
        exhausted: false,
      },
      deferred: async () => {},
    };
  }

  await assignGapOwner(gapId, {
    name: request.ownerName.trim(),
    role: request.ownerRole?.trim() || null,
  });

  await prisma.turn.create({
    data: {
      workspaceId,
      role: TurnRole.USER,
      medium,
      content: `I don't know — ask ${request.ownerName.trim()}${
        request.ownerRole?.trim() ? ` (${request.ownerRole.trim()})` : ''
      }`,
    },
  });

  // Move on immediately: the register carries the owner, so the interview does
  // not have to.
  const gap = await nextGapOrRebuild(workspaceId);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { overallPct: true },
  });

  if (!gap) {
    return {
      response: {
        reply: NOTHING_LEFT,
        question: null,
        awaitingOwnerForGapId: null,
        completeness: workspace.overallPct,
        exhausted: true,
      },
      deferred: async () => {
        await refreshGapCache(workspaceId);
      },
    };
  }

  const reply = `Noted — I'll put that against their name. ${gap.questionText}`;

  await prisma.turn.create({
    data: {
      workspaceId,
      role: TurnRole.ASSISTANT,
      medium,
      content: reply,
      askedDimension: gap.dimension,
      askedSlot: gap.slot,
    },
  });
  await markAsked(gap.id);

  return {
    response: {
      reply,
      question: {
        gapId: gap.id,
        dimension: gap.dimension,
        slot: gap.slot,
        question: gap.questionText,
        blocking: gap.blocking,
      },
      awaitingOwnerForGapId: null,
      completeness: workspace.overallPct,
      exhausted: false,
    },
    deferred: async () => {
      await refreshGapCache(workspaceId);
    },
  };
}

/**
 * Turn the exec's answer into claims. Deferred work: this is a model call, so
 * it happens after the reply, never before it.
 */
async function ingestAnswer(
  request: TurnRequest,
  userTurnId: string | null,
  askedGap: { dimension: string; slot: string; questionText: string } | null,
): Promise<void> {
  const content = request.content?.trim();
  if (!content || !userTurnId) return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: request.workspaceId },
    select: { vocabulary: true },
  });

  const extraction = await extractClaims({
    text: content,
    kind: ArtifactKind.CHAT,
    label: 'live answer',
    knownVocabulary: Array.isArray(workspace?.vocabulary)
      ? (workspace.vocabulary as unknown as VocabularyTerm[])
      : [],
    askedAbout: askedGap
      ? {
          dimension: askedGap.dimension,
          slot: askedGap.slot,
          question: askedGap.questionText,
        }
      : undefined,
  });

  await storeClaims({
    workspaceId: request.workspaceId,
    extraction,
    sourceTurnId: userTurnId,
    defaultSpeaker: 'Business user',
  });

  if (askedGap) {
    await markAnsweredIfFilled(
      request.workspaceId,
      askedGap.dimension as never,
      askedGap.slot,
    );
  }
}

export { scheduleGapRefresh };
