-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('uptime', 'ssl', 'domain');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('success', 'failure', 'inconclusive');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('up', 'degraded', 'down', 'unknown');

-- CreateEnum
CREATE TYPE "SslState" AS ENUM ('valid', 'expiring', 'invalid', 'expired', 'none', 'unknown');

-- CreateEnum
CREATE TYPE "DomainState" AS ENUM ('ok', 'expiring', 'unsupported', 'error', 'unknown');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('downtime', 'ssl_invalid', 'ssl_expiry', 'domain_expiry');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'acknowledged', 'muted', 'resolved');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "incidentSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "monitor_check" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "checkType" "CheckType" NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER,
    "httpStatusCode" INTEGER,
    "failureCategory" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitor_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_state" (
    "siteId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "liveStatus" "LiveStatus" NOT NULL DEFAULT 'unknown',
    "statusDetail" TEXT,
    "statusSince" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "lastResponseMs" INTEGER,
    "lastHttpStatus" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sslState" "SslState" NOT NULL DEFAULT 'unknown',
    "sslExpiresAt" TIMESTAMP(3),
    "sslIssuer" TEXT,
    "sslDetail" TEXT,
    "sslCheckedAt" TIMESTAMP(3),
    "nextSslCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domainState" "DomainState" NOT NULL DEFAULT 'unknown',
    "domainExpiresAt" TIMESTAMP(3),
    "domainSource" TEXT,
    "domainDetail" TEXT,
    "domainCheckedAt" TIMESTAMP(3),
    "nextDomainCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualCheckAfter" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_state_pkey" PRIMARY KEY ("siteId")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "openKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "note" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "jobType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "payload" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "activeKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitor_check_siteId_checkType_checkedAt_idx" ON "monitor_check"("siteId", "checkType", "checkedAt");

-- CreateIndex
CREATE INDEX "monitor_check_workspaceId_checkedAt_idx" ON "monitor_check"("workspaceId", "checkedAt");

-- CreateIndex
CREATE INDEX "site_state_nextCheckAt_idx" ON "site_state"("nextCheckAt");

-- CreateIndex
CREATE INDEX "site_state_nextSslCheckAt_idx" ON "site_state"("nextSslCheckAt");

-- CreateIndex
CREATE INDEX "site_state_nextDomainCheckAt_idx" ON "site_state"("nextDomainCheckAt");

-- CreateIndex
CREATE INDEX "site_state_workspaceId_idx" ON "site_state"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_openKey_key" ON "incident"("openKey");

-- CreateIndex
CREATE INDEX "incident_workspaceId_status_idx" ON "incident"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "incident_siteId_firstDetectedAt_idx" ON "incident"("siteId", "firstDetectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "incident_workspaceId_number_key" ON "incident"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "incident_event_incidentId_createdAt_idx" ON "incident_event"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_activeKey_key" ON "job"("activeKey");

-- CreateIndex
CREATE INDEX "job_status_runAt_priority_idx" ON "job"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "job_status_lockedAt_idx" ON "job"("status", "lockedAt");

-- AddForeignKey
ALTER TABLE "monitor_check" ADD CONSTRAINT "monitor_check_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_state" ADD CONSTRAINT "site_state_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
