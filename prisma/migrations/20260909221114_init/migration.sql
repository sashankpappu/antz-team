-- CreateEnum
CREATE TYPE "Dimension" AS ENUM ('ACTORS', 'TRIGGERS', 'SYSTEMS', 'DATA', 'DECISION_RULES', 'EXCEPTIONS', 'HANDOFFS', 'VOLUMES', 'DONE_CRITERIA');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('DECK', 'TRANSCRIPT', 'DOC', 'CHAT', 'AUDIO');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('SEEDED', 'IN_SESSION', 'ABANDONED', 'HANDOFF_READY');

-- CreateEnum
CREATE TYPE "GapStatus" AS ENUM ('OPEN', 'ANSWERED', 'DEFERRED', 'OWNED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TurnRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "TurnMedium" AS ENUM ('VOICE', 'TEXT');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'SEEDED',
    "inferredRole" TEXT,
    "inferredDomain" TEXT,
    "vocabulary" JSONB NOT NULL DEFAULT '[]',
    "gapsComputedAt" TIMESTAMP(3),
    "overallPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "storageKey" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dimension" "Dimension" NOT NULL,
    "slot" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "quote" TEXT,
    "sourceArtifactId" TEXT,
    "sourceTurnId" TEXT,
    "speaker" TEXT,
    "confidence" "Confidence" NOT NULL,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "claimAId" TEXT NOT NULL,
    "claimBId" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dimension" "Dimension" NOT NULL,
    "slot" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "status" "GapStatus" NOT NULL DEFAULT 'OPEN',
    "ownerName" TEXT,
    "ownerRole" TEXT,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "askedCount" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "TurnRole" NOT NULL,
    "medium" "TurnMedium" NOT NULL,
    "content" TEXT NOT NULL,
    "command" TEXT,
    "askedDimension" "Dimension",
    "askedSlot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dimension" "Dimension" NOT NULL,
    "pct" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_shareToken_key" ON "Workspace"("shareToken");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- CreateIndex
CREATE INDEX "Artifact_workspaceId_idx" ON "Artifact"("workspaceId");

-- CreateIndex
CREATE INDEX "Artifact_purgeAfter_idx" ON "Artifact"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_supersededById_key" ON "Claim"("supersededById");

-- CreateIndex
CREATE INDEX "Claim_workspaceId_dimension_slot_idx" ON "Claim"("workspaceId", "dimension", "slot");

-- CreateIndex
CREATE INDEX "Claim_workspaceId_confidence_idx" ON "Claim"("workspaceId", "confidence");

-- CreateIndex
CREATE INDEX "Conflict_workspaceId_status_idx" ON "Conflict"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Conflict_claimAId_claimBId_key" ON "Conflict"("claimAId", "claimBId");

-- CreateIndex
CREATE INDEX "Gap_workspaceId_status_rank_idx" ON "Gap"("workspaceId", "status", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Gap_workspaceId_dimension_slot_key" ON "Gap"("workspaceId", "dimension", "slot");

-- CreateIndex
CREATE INDEX "Turn_workspaceId_createdAt_idx" ON "Turn"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Score_workspaceId_idx" ON "Score"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_workspaceId_dimension_key" ON "Score"("workspaceId", "dimension");

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "Turn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_claimAId_fkey" FOREIGN KEY ("claimAId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_claimBId_fkey" FOREIGN KEY ("claimBId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gap" ADD CONSTRAINT "Gap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
