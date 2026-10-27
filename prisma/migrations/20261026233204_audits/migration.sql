-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('info', 'low', 'medium', 'high');

-- AlterEnum
ALTER TYPE "IncidentType" ADD VALUE 'audit_issue';

-- AlterTable
ALTER TABLE "site_state" ADD COLUMN     "lastAuditAt" TIMESTAMP(3),
ADD COLUMN     "lastAuditRunId" TEXT,
ADD COLUMN     "lastAuditStatus" "AuditStatus",
ADD COLUMN     "nextAuditAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "openFindings" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "audit_run" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'queued',
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pagesVisited" INTEGER NOT NULL DEFAULT 0,
    "pagesBudget" INTEGER NOT NULL DEFAULT 0,
    "linksChecked" INTEGER NOT NULL DEFAULT 0,
    "inconclusiveLinks" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "robots" TEXT,
    "partialReasons" TEXT[],
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_finding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "sourceUrl" TEXT,
    "targetUrl" TEXT,
    "statusCode" INTEGER,
    "summary" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "openKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_run_siteId_createdAt_idx" ON "audit_run"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_run_workspaceId_createdAt_idx" ON "audit_run"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_finding_openKey_key" ON "audit_finding"("openKey");

-- CreateIndex
CREATE INDEX "audit_finding_siteId_resolvedAt_idx" ON "audit_finding"("siteId", "resolvedAt");

-- CreateIndex
CREATE INDEX "audit_finding_auditRunId_idx" ON "audit_finding"("auditRunId");

-- CreateIndex
CREATE INDEX "site_state_nextAuditAt_idx" ON "site_state"("nextAuditAt");

-- AddForeignKey
ALTER TABLE "audit_run" ADD CONSTRAINT "audit_run_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "audit_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
