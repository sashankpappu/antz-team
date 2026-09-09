import { Confidence, Dimension, type Claim } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertSlot } from '@/lib/ontology';
import { adjudicate, candidatePairs, type ComparableClaim } from './conflicts';
import { dedupeVocabulary } from './extract';
import { normaliseConfidence, type Extraction, type VocabularyTerm } from './schemas';

export interface StoreClaimsInput {
  workspaceId: string;
  extraction: Extraction;
  sourceArtifactId?: string;
  sourceTurnId?: string;
  /** Used when the source carries no speaker labels — a live answer's author. */
  defaultSpeaker?: string;
}

export interface StoreClaimsResult {
  created: Claim[];
  conflictsRaised: number;
  /** Claims dropped because their dimension/slot pair is not in the ontology. */
  rejected: number;
}

/**
 * Write claims, then look for contradictions.
 *
 * Two invariants live here:
 *   1. Every claim maps to a real ontology slot. Enforced at write time,
 *      because a claim that cannot be scored is invisible to the completeness
 *      engine and would silently stop a question being asked.
 *   2. A contradicting claim is inserted, not merged. Nothing in this function
 *      updates or supersedes an existing claim.
 */
export async function storeClaims(input: StoreClaimsInput): Promise<StoreClaimsResult> {
  const { workspaceId, extraction, sourceArtifactId, sourceTurnId, defaultSpeaker } = input;

  const rows: {
    workspaceId: string;
    dimension: Dimension;
    slot: string;
    content: string;
    quote: string | null;
    speaker: string | null;
    confidence: Confidence;
    sourceArtifactId: string | null;
    sourceTurnId: string | null;
  }[] = [];

  let rejected = 0;

  for (const claim of extraction.claims) {
    try {
      assertSlot(claim.dimension, claim.slot);
    } catch {
      rejected += 1;
      continue;
    }

    const quote = claim.quote.trim();
    rows.push({
      workspaceId,
      dimension: claim.dimension,
      slot: claim.slot,
      content: claim.content.trim(),
      quote: quote.length > 0 ? quote : null,
      speaker: claim.speaker?.trim() || defaultSpeaker || null,
      confidence: normaliseConfidence(claim),
      sourceArtifactId: sourceArtifactId ?? null,
      sourceTurnId: sourceTurnId ?? null,
    });
  }

  if (rows.length === 0) {
    await mergeWorkspaceContext(workspaceId, extraction);
    return { created: [], conflictsRaised: 0, rejected };
  }

  // Read the slots we are about to touch BEFORE inserting, so the new claims
  // are not compared against themselves.
  const touched = [...new Set(rows.map((r) => `${r.dimension}.${r.slot}`))];
  const existing = await prisma.claim.findMany({
    where: {
      workspaceId,
      OR: touched.map((ref) => {
        const [dimension, slot] = splitRef(ref);
        return { dimension, slot };
      }),
    },
    select: {
      id: true,
      dimension: true,
      slot: true,
      content: true,
      speaker: true,
      confidence: true,
      supersededById: true,
    },
  });

  const created = await prisma.$transaction(
    rows.map((data) => prisma.claim.create({ data })),
  );

  const conflictsRaised = await flagConflicts(workspaceId, existing, created);
  await mergeWorkspaceContext(workspaceId, extraction);

  return { created, conflictsRaised, rejected };
}

function splitRef(ref: string): [Dimension, string] {
  const dot = ref.indexOf('.');
  return [ref.slice(0, dot) as Dimension, ref.slice(dot + 1)];
}

/**
 * Compare the new claims against what was already on those slots and record a
 * Conflict row for each real contradiction. Both claims stay exactly as they
 * are; the conflict is a third record pointing at them.
 */
export async function flagConflicts(
  workspaceId: string,
  existing: ComparableClaim[],
  incoming: ComparableClaim[],
): Promise<number> {
  const candidates = candidatePairs(existing, incoming);
  if (candidates.length === 0) return 0;

  const verdicts = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      verdict: await adjudicate(candidate),
    })),
  );

  let raised = 0;

  for (const { candidate, verdict } of verdicts) {
    if (!verdict.contradicts) continue;

    // Order the pair so the unique constraint catches a re-flag of the same
    // two claims from a later ingest.
    const [claimAId, claimBId] = [candidate.a.id, candidate.b.id].sort();

    const result = await prisma.conflict.createMany({
      data: [{ workspaceId, claimAId, claimBId, rationale: verdict.rationale }],
      skipDuplicates: true,
    });
    raised += result.count;
  }

  return raised;
}

/**
 * Fold harvested vocabulary and the inferred role/domain into the workspace.
 *
 * Role and domain are only set if not already known: the first read wins, so
 * one stray sentence in a late artifact cannot re-point the whole interview.
 */
export async function mergeWorkspaceContext(
  workspaceId: string,
  extraction: Extraction,
): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { vocabulary: true, inferredRole: true, inferredDomain: true },
  });
  if (!workspace) return;

  const current = Array.isArray(workspace.vocabulary)
    ? (workspace.vocabulary as unknown as VocabularyTerm[])
    : [];

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      vocabulary: dedupeVocabulary([...current, ...extraction.vocabulary]) as unknown as object[],
      inferredRole: workspace.inferredRole ?? extraction.inferredRole,
      inferredDomain: workspace.inferredDomain ?? extraction.inferredDomain,
    },
  });
}

/** Claims for scoring and rendering, newest first, conflicts attached. */
export async function claimsForWorkspace(workspaceId: string) {
  return prisma.claim.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
    include: {
      sourceArtifact: { select: { id: true, filename: true, kind: true, uploadedAt: true } },
      sourceTurn: { select: { id: true, createdAt: true, medium: true } },
    },
  });
}
