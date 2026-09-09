import { Confidence, Dimension, GapStatus, type Gap } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { VocabularyTerm } from '@/lib/claims/schemas';
import { isModelConfigured } from '@/lib/anthropic';
import { score, type Scorecard } from '@/lib/ontology';
import { fallbackQuestion, generateQuestions, type QuestionContext } from './question';
import { rankOpenSlots, type GapState } from './rank';

/**
 * The gap cache.
 *
 * The completeness engine never runs inside the interview loop. The
 * interviewer reads this cache and responds immediately; scoring, ranking and
 * question generation all happen after the turn has already been answered.
 *
 * A stale question is fine. A two-second pause is not — and once voice lands
 * (target: under 800ms, interruptible) a pause is fatal, which is why the
 * cache exists now rather than later. This module is the interface a realtime
 * layer will read, unchanged.
 */

export const CACHE_DEPTH = 5;

/** Rank given to a gap the ranking algorithm has pushed out of the cache. */
export const UNCACHED_RANK = 999;

/**
 * Read side. One indexed query, no scoring, no model call. Never blocks.
 *
 * Only gaps the last ranking pass actually put in the cache are eligible —
 * askability (including "already asked once") was decided there, so the read
 * side does not re-derive it and cannot disagree with it.
 */
export async function readGapCache(workspaceId: string, limit = CACHE_DEPTH): Promise<Gap[]> {
  return prisma.gap.findMany({
    where: { workspaceId, status: GapStatus.OPEN, rank: { lt: UNCACHED_RANK } },
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
}

/** The single next question from the cache. Null on a cache miss. */
export async function nextGap(workspaceId: string): Promise<Gap | null> {
  const [gap] = await readGapCache(workspaceId, 1);
  return gap ?? null;
}

/**
 * The next question, treating an empty cache as a cache miss rather than as
 * "nothing left to ask".
 *
 * The difference matters: "I have no more questions" is a claim about the
 * ontology being full, and saying it because a cache had not been built yet
 * would end a session that had barely started — which is exactly what an
 * unseeded workspace would do on its first turn.
 *
 * The decision itself is free: scoring and ranking are pure functions over
 * rows we already have. Only when they say slots remain do we rebuild the
 * cache, and that is the one moment a turn may wait on the completeness
 * engine. It happens at most once per session, before any question has been
 * asked, so no exec is ever left watching a pause mid-conversation.
 */
export async function nextGapOrRebuild(workspaceId: string): Promise<Gap | null> {
  const cached = await nextGap(workspaceId);
  if (cached) return cached;

  const [claims, gaps, workspace] = await Promise.all([
    prisma.claim.findMany({
      where: { workspaceId },
      select: { dimension: true, slot: true, confidence: true, supersededById: true },
    }),
    prisma.gap.findMany({
      where: { workspaceId },
      select: { dimension: true, slot: true, status: true, askedCount: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { inferredRole: true },
    }),
  ]);

  const remaining = rankOpenSlots({
    scorecard: score(claims),
    claims,
    gaps,
    role: workspace?.inferredRole,
  });

  // Genuinely nothing left: every slot is either filled or already dealt with.
  if (remaining.length === 0) return null;

  await refreshGapCache(workspaceId);
  return nextGap(workspaceId);
}

export interface RefreshResult {
  scorecard: Scorecard;
  cached: number;
  usedFallback: boolean;
}

/**
 * Write side. Rescore from the claim store, re-rank the open slots, generate
 * questions for the top few, and persist them.
 *
 * Runs off the critical path — after a turn, after an ingest, never before a
 * response.
 */
export async function refreshGapCache(
  workspaceId: string,
  depth = CACHE_DEPTH,
): Promise<RefreshResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { inferredRole: true, inferredDomain: true, vocabulary: true },
  });
  if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);

  const [claims, gaps, recentTurns] = await Promise.all([
    prisma.claim.findMany({
      where: { workspaceId },
      select: {
        dimension: true,
        slot: true,
        content: true,
        speaker: true,
        confidence: true,
        supersededById: true,
      },
    }),
    prisma.gap.findMany({
      where: { workspaceId },
      select: {
        id: true,
        dimension: true,
        slot: true,
        status: true,
        askedCount: true,
        ownerName: true,
      },
    }),
    prisma.turn.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { role: true, content: true },
    }),
  ]);

  const scorecard = score(claims);

  const gapState: GapState[] = gaps.map((g) => ({
    dimension: g.dimension,
    slot: g.slot,
    status: g.status,
    askedCount: g.askedCount,
  }));

  const ranked = rankOpenSlots({
    scorecard,
    claims,
    gaps: gapState,
    role: workspace.inferredRole,
  });

  const top = ranked.slice(0, depth);

  const context: QuestionContext = {
    role: workspace.inferredRole,
    domain: workspace.inferredDomain,
    vocabulary: Array.isArray(workspace.vocabulary)
      ? (workspace.vocabulary as unknown as VocabularyTerm[])
      : [],
    claims: claims.map((c) => ({
      dimension: c.dimension,
      slot: c.slot,
      content: c.content,
      speaker: c.speaker,
      confidence: c.confidence,
    })),
    recentTurns: recentTurns
      .reverse()
      .map((t) => ({ role: t.role as 'USER' | 'ASSISTANT', content: t.content })),
    ownedGaps: gaps
      .filter((g) => g.status === GapStatus.OWNED)
      .map((g) => ({ slot: `${g.dimension}.${g.slot}`, ownerName: g.ownerName })),
  };

  let usedFallback = false;
  let questions;

  if (isModelConfigured() && top.length > 0) {
    try {
      questions = await generateQuestions(top, context);
    } catch {
      // A generation failure must not empty the register. The ontology's own
      // phrasing is colder but never wrong, and the session keeps moving.
      usedFallback = true;
      questions = top.map(fallbackQuestion);
    }
  } else {
    usedFallback = top.length > 0;
    questions = top.map(fallbackQuestion);
  }

  const questionByRef = new Map(
    questions.map((q) => [`${q.dimension}.${q.slot}`, q.question]),
  );

  await prisma.$transaction(async (tx) => {
    for (const [index, slot] of top.entries()) {
      const ref = `${slot.dimension}.${slot.slot}`;
      const questionText = questionByRef.get(ref) ?? fallbackQuestion(slot).question;

      await tx.gap.upsert({
        where: {
          workspaceId_dimension_slot: {
            workspaceId,
            dimension: slot.dimension,
            slot: slot.slot,
          },
        },
        create: {
          workspaceId,
          dimension: slot.dimension,
          slot: slot.slot,
          questionText,
          blocking: slot.blockingWeight === 3,
          rank: index,
          score: slot.score,
        },
        // An already-asked or owned gap keeps its status and its question. Only
        // the ordering and the score are refreshed.
        update: {
          questionText,
          blocking: slot.blockingWeight === 3,
          rank: index,
          score: slot.score,
        },
      });
    }

    // Slots that dropped out of the top N are pushed to the back rather than
    // deleted: the register in /gaps is the full picture, not just the cache.
    await tx.gap.updateMany({
      where: {
        workspaceId,
        status: GapStatus.OPEN,
        NOT: top.map((s) => ({ dimension: s.dimension, slot: s.slot })),
      },
      data: { rank: UNCACHED_RANK },
    });

    for (const dimension of scorecard.dimensions) {
      await tx.score.upsert({
        where: {
          workspaceId_dimension: { workspaceId, dimension: dimension.dimension },
        },
        create: { workspaceId, dimension: dimension.dimension, pct: dimension.pct },
        update: { pct: dimension.pct, computedAt: new Date() },
      });
    }

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { overallPct: scorecard.overallPct, gapsComputedAt: new Date() },
    });
  });

  return { scorecard, cached: top.length, usedFallback };
}

/**
 * Kick a refresh without waiting for it.
 *
 * Called after the response has been sent. Swallows failures on purpose: a
 * refresh that fails leaves a stale cache, which is a degraded next question,
 * not a broken session.
 */
export function scheduleGapRefresh(workspaceId: string): void {
  void refreshGapCache(workspaceId).catch((error) => {
    console.error(`[gap-cache] refresh failed for ${workspaceId}:`, error);
  });
}

/** Mark a gap as put to the exec. Enforces "never ask the same slot twice". */
export async function markAsked(gapId: string): Promise<void> {
  await prisma.gap.update({
    where: { id: gapId },
    data: { askedCount: { increment: 1 } },
  });
}

/**
 * An answer landed. The slot may still not be filled — a vague answer produces
 * a low-confidence claim and no fill — so status only moves to ANSWERED once a
 * claim actually fills it. Scoring decides, not the conversation.
 */
export async function markAnsweredIfFilled(
  workspaceId: string,
  dimension: Dimension,
  slot: string,
): Promise<boolean> {
  const filling = await prisma.claim.findFirst({
    where: {
      workspaceId,
      dimension,
      slot,
      supersededById: null,
      confidence: { in: [Confidence.MEDIUM, Confidence.HIGH] },
    },
    select: { id: true },
  });

  if (!filling) return false;

  await prisma.gap.updateMany({
    where: { workspaceId, dimension, slot },
    data: { status: GapStatus.ANSWERED },
  });
  return true;
}

/**
 * "I don't know — ask Ravi in IT." The gap becomes owned and tracked, and the
 * interview moves on. We never push twice.
 */
export async function assignGapOwner(
  gapId: string,
  owner: { name: string; role?: string | null },
): Promise<Gap> {
  return prisma.gap.update({
    where: { id: gapId },
    data: {
      status: GapStatus.OWNED,
      ownerName: owner.name,
      ownerRole: owner.role ?? null,
    },
  });
}

/** "I don't know" with nobody named. Deferred, still visible in the register. */
export async function deferGap(gapId: string): Promise<Gap> {
  return prisma.gap.update({
    where: { id: gapId },
    data: { status: GapStatus.DEFERRED },
  });
}

/** The full register for /gaps: everything open, owned or deferred. */
export async function gapRegister(workspaceId: string): Promise<Gap[]> {
  return prisma.gap.findMany({
    where: { workspaceId, status: { not: GapStatus.ANSWERED } },
    orderBy: [{ blocking: 'desc' }, { rank: 'asc' }, { createdAt: 'asc' }],
  });
}
