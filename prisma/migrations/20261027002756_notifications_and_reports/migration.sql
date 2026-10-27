-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'failed', 'suppressed', 'bounced');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('generating', 'needs_review', 'sent', 'no_data', 'failed');

-- AlterTable
ALTER TABLE "incident" ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site" ADD COLUMN     "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "logoStorageKey" TEXT,
ADD COLUMN     "reportContact" TEXT;

-- CreateTable
CREATE TABLE "notification_settings" (
    "workspaceId" TEXT NOT NULL,
    "recipientUserIds" TEXT[],
    "events" JSONB NOT NULL,
    "repeatMinutes" INTEGER NOT NULL DEFAULT 60,
    "reportDelivery" TEXT NOT NULL DEFAULT 'review',
    "linkExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "email_delivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "incidentId" TEXT,
    "reportId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_recipient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "lastBouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_report" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'monthly',
    "code" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'generating',
    "data" JSONB,
    "disclosures" TEXT[],
    "storageKey" TEXT,
    "generatedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "privateTokenHash" TEXT,
    "linkExpiresAt" TIMESTAMP(3),
    "linkRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_delivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailDeliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_deduplicationKey_key" ON "email_delivery"("deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_providerMessageId_key" ON "email_delivery"("providerMessageId");

-- CreateIndex
CREATE INDEX "email_delivery_incidentId_idx" ON "email_delivery"("incidentId");

-- CreateIndex
CREATE INDEX "email_delivery_reportId_idx" ON "email_delivery"("reportId");

-- CreateIndex
CREATE INDEX "email_delivery_workspaceId_createdAt_idx" ON "email_delivery"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_recipient_clientId_email_key" ON "client_recipient"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_report_privateTokenHash_key" ON "monthly_report"("privateTokenHash");

-- CreateIndex
CREATE INDEX "monthly_report_workspaceId_periodStart_idx" ON "monthly_report"("workspaceId", "periodStart");

-- CreateIndex
CREATE INDEX "monthly_report_clientId_periodStart_idx" ON "monthly_report"("clientId", "periodStart");

-- CreateIndex
CREATE INDEX "report_delivery_reportId_idx" ON "report_delivery"("reportId");

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_recipient" ADD CONSTRAINT "client_recipient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_report" ADD CONSTRAINT "monthly_report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_report" ADD CONSTRAINT "monthly_report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_delivery" ADD CONSTRAINT "report_delivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "monthly_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
