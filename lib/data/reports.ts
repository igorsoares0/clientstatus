import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { notFound, UserFacingError } from "@/lib/data/errors";
import { assertRole, type TenantContext } from "@/lib/data/tenant";
import { recordAudit } from "@/lib/data/workspace-tx";
import { hashReportToken, isWellFormedToken } from "@/lib/reports/token";

/** A sent report behind a live private link, or null (unknown, revoked or expired). */
export async function findReportByToken(db: PrismaClient, token: string, now = new Date()) {
  if (!isWellFormedToken(token)) return null;
  return db.monthlyReport.findFirst({
    where: {
      privateTokenHash: hashReportToken(token),
      status: "sent",
      linkRevokedAt: null,
      linkExpiresAt: { gt: now },
    },
    select: { id: true, workspaceId: true, data: true, storageKey: true, periodLabel: true, code: true },
  });
}

// ─── Workspace-scoped reads and writes for the Reports UI ──────────────────

export async function listReports(db: PrismaClient, ctx: TenantContext, opts: { periodStart?: Date } = {}) {
  return db.monthlyReport.findMany({
    where: { workspaceId: ctx.workspaceId, ...(opts.periodStart ? { periodStart: opts.periodStart } : {}) },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      kind: true,
      code: true,
      status: true,
      periodStart: true,
      periodLabel: true,
      disclosures: true,
      generatedAt: true,
      sentAt: true,
      linkExpiresAt: true,
      linkRevokedAt: true,
      privateTokenHash: true,
      createdAt: true,
      client: { select: { id: true, name: true } },
      deliveries: { select: { email: true, emailDeliveryId: true } },
    },
  });
}

export async function reportPeriods(db: PrismaClient, ctx: TenantContext) {
  const rows = await db.monthlyReport.findMany({
    where: { workspaceId: ctx.workspaceId },
    distinct: ["periodStart"],
    orderBy: { periodStart: "desc" },
    select: { periodStart: true, periodLabel: true },
    take: 24,
  });
  return rows;
}

export async function getReport(db: PrismaClient, ctx: TenantContext, id: string) {
  const report = await db.monthlyReport.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      client: { select: { id: true, name: true, status: true } },
      deliveries: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) throw notFound("report");
  const emailIds = report.deliveries.map((d) => d.emailDeliveryId).filter((x): x is string => Boolean(x));
  const emails = await db.emailDelivery.findMany({
    where: { id: { in: emailIds } },
    select: { id: true, status: true, sentAt: true, lastError: true },
  });
  return { ...report, emailStatus: new Map(emails.map((e) => [e.id, e])) };
}

export async function listRecipients(db: PrismaClient, ctx: TenantContext, clientId: string) {
  return db.clientRecipient.findMany({
    where: { workspaceId: ctx.workspaceId, clientId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addRecipient(
  db: PrismaClient,
  ctx: TenantContext,
  clientId: string,
  input: { email: string; name?: string | null },
) {
  assertRole(ctx, "admin");
  const client = await db.client.findFirst({
    where: { id: clientId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!client) throw notFound("client");
  const email = input.email.trim().toLowerCase();
  const count = await db.clientRecipient.count({ where: { clientId } });
  if (count >= 10) throw new UserFacingError("A client can have up to 10 report recipients.", "invalid");
  try {
    const r = await db.clientRecipient.create({
      data: { workspaceId: ctx.workspaceId, clientId, email, name: input.name?.trim() || null },
    });
    await recordAudit(db, ctx, "recipient.added", "client", clientId);
    return r;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new UserFacingError(`${email} is already a recipient.`, "duplicate", "email");
    throw error;
  }
}

export async function removeRecipient(db: PrismaClient, ctx: TenantContext, recipientId: string) {
  assertRole(ctx, "admin");
  const { count } = await db.clientRecipient.deleteMany({ where: { id: recipientId, workspaceId: ctx.workspaceId } });
  if (!count) throw notFound("recipient");
}

export type SettingsUpdate = {
  recipientUserIds: string[];
  events: Prisma.InputJsonValue;
  repeatMinutes: number;
  reportDelivery: "review" | "auto";
  linkExpiryDays: number;
};

export async function updateNotificationSettings(db: PrismaClient, ctx: TenantContext, input: SettingsUpdate) {
  assertRole(ctx, "admin");
  // Only current members can receive alerts.
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId, userId: { in: input.recipientUserIds } },
    select: { userId: true },
  });
  const recipientUserIds = members.map((m) => m.userId);
  if (recipientUserIds.length === 0)
    throw new UserFacingError("Select at least one person to receive alert emails.", "invalid");
  await db.notificationSettings.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId, ...input, recipientUserIds },
    update: { ...input, recipientUserIds },
  });
  await recordAudit(db, ctx, "settings.alerts_updated", "workspace", ctx.workspaceId);
}

export type BrandingUpdate = { name: string; color: string | null; contact: string | null; footer: string | null };

export async function updateBranding(db: PrismaClient, ctx: TenantContext, input: BrandingUpdate) {
  assertRole(ctx, "admin");
  await db.workspace.update({
    where: { id: ctx.workspaceId },
    data: {
      name: input.name,
      brandPrimaryColor: input.color,
      reportContact: input.contact,
      reportFooter: input.footer,
    },
  });
  await recordAudit(db, ctx, "settings.branding_updated", "workspace", ctx.workspaceId);
}
