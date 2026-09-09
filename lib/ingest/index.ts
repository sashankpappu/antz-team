import { ArtifactKind } from '@prisma/client';
import { extractClaims } from '@/lib/claims/extract';
import type { VocabularyTerm } from '@/lib/claims/schemas';
import { storeClaims } from '@/lib/claims/store';
import { purgeAfterFromNow } from '@/lib/config';
import { prisma } from '@/lib/db';
import { refreshGapCache } from '@/lib/interview/gap-cache';
import { artifactKey, getStorage } from '@/lib/storage';
import { extractPaste, extractText } from './extract-text';

export * from './extract-text';
export * from './transcript';

/**
 * Ingest.
 *
 * All four input types land as artifacts and are extracted into claims by the
 * same pipeline. An artifact is evidence, never truth: nothing here writes a
 * fact anywhere except as a claim with a source, a speaker and a confidence.
 */

export interface IngestResult {
  artifactId: string;
  claimsCreated: number;
  conflictsRaised: number;
  chunks: number;
}

async function knownVocabulary(workspaceId: string): Promise<VocabularyTerm[]> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { vocabulary: true },
  });
  return Array.isArray(workspace?.vocabulary)
    ? (workspace.vocabulary as unknown as VocabularyTerm[])
    : [];
}

/** Upload: a file. The original bytes go to the configured blob store. */
export async function ingestFile(input: {
  workspaceId: string;
  filename: string;
  bytes: Uint8Array;
  uploadedBy: string;
  kind?: ArtifactKind;
  contentType?: string;
}): Promise<IngestResult> {
  const { text, kind } = await extractText(input.filename, input.bytes, input.kind);

  const artifact = await prisma.artifact.create({
    data: {
      workspaceId: input.workspaceId,
      kind,
      filename: input.filename,
      rawText: text,
      uploadedBy: input.uploadedBy,
      purgeAfter: purgeAfterFromNow(),
    },
    select: { id: true },
  });

  // Store the original after the row exists, so a stored blob always has a
  // record pointing at it and a purge can always find it.
  const storage = await getStorage();
  const key = artifactKey(input.workspaceId, artifact.id, input.filename);
  await storage.put(key, input.bytes, input.contentType);
  await prisma.artifact.update({ where: { id: artifact.id }, data: { storageKey: key } });

  return finishIngest(input.workspaceId, artifact.id, text, kind, input.filename);
}

/** Paste: a transcript, a chat thread, an email. No original file exists. */
export async function ingestPaste(input: {
  workspaceId: string;
  label: string;
  raw: string;
  kind: ArtifactKind;
  uploadedBy: string;
}): Promise<IngestResult> {
  const { text, kind } = extractPaste(input.raw, input.kind);

  const artifact = await prisma.artifact.create({
    data: {
      workspaceId: input.workspaceId,
      kind,
      filename: input.label,
      rawText: text,
      uploadedBy: input.uploadedBy,
      purgeAfter: purgeAfterFromNow(),
    },
    select: { id: true },
  });

  return finishIngest(input.workspaceId, artifact.id, text, kind, input.label);
}

async function finishIngest(
  workspaceId: string,
  artifactId: string,
  text: string,
  kind: ArtifactKind,
  label: string,
): Promise<IngestResult> {
  const extraction = await extractClaims({
    text,
    kind,
    label,
    knownVocabulary: await knownVocabulary(workspaceId),
  });

  const stored = await storeClaims({
    workspaceId,
    extraction,
    sourceArtifactId: artifactId,
  });

  await prisma.artifact.update({
    where: { id: artifactId },
    data: { extractedAt: new Date() },
  });

  // Seeding is what makes the first question an informed one, so the cache is
  // rebuilt here rather than lazily on the exec's first turn.
  await refreshGapCache(workspaceId);

  return {
    artifactId,
    claimsCreated: stored.created.length,
    conflictsRaised: stored.conflictsRaised,
    chunks: extraction.chunks,
  };
}

/**
 * Hard-delete raw artifact material past its retention horizon. Derived claims
 * survive: they are the requirement, and they carry no audio and no verbatim
 * third-party speech beyond the quote that evidences them.
 */
export async function purgeExpiredArtifacts(now = new Date()): Promise<number> {
  const expired = await prisma.artifact.findMany({
    where: { purgeAfter: { not: null, lte: now }, rawText: { not: '' } },
    select: { id: true, storageKey: true },
  });

  if (expired.length === 0) return 0;

  const storage = expired.some((a) => a.storageKey) ? await getStorage() : null;

  for (const artifact of expired) {
    if (artifact.storageKey && storage) {
      await storage.delete(artifact.storageKey);
    }
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { rawText: '', storageKey: null },
    });
  }

  return expired.length;
}
