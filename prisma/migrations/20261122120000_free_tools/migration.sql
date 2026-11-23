-- CreateEnum
CREATE TYPE "ToolRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "tool_run" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "ToolRunStatus" NOT NULL DEFAULT 'queued',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "tool_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_lead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "consent" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "toolRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_run_createdAt_idx" ON "tool_run"("createdAt");

-- CreateIndex
CREATE INDEX "tool_lead_email_idx" ON "tool_lead"("email");

-- CreateIndex
CREATE INDEX "tool_lead_createdAt_idx" ON "tool_lead"("createdAt");

