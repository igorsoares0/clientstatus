-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "DownPolicy" AS ENUM ('server_errors', 'non_success');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "normalizedHostname" TEXT NOT NULL,
    "registrableDomain" TEXT,
    "liveHostKey" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'active',
    "downPolicy" "DownPolicy" NOT NULL DEFAULT 'server_errors',
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "crawlConfig" JSONB,
    "pausedAt" TIMESTAMP(3),
    "pausedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_workspaceId_status_idx" ON "client"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_workspaceId_nameKey_key" ON "client"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "site_workspaceId_status_idx" ON "site"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "site_workspaceId_clientId_idx" ON "site"("workspaceId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "site_workspaceId_liveHostKey_key" ON "site"("workspaceId", "liveHostKey");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_pausedById_fkey" FOREIGN KEY ("pausedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
