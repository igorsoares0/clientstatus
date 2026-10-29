import { assertCanOperate } from "@/lib/billing/access";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { FindingSeverity } from "@/lib/generated/prisma/enums";
import { notFound, UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";
import { lockWorkspace, type Tx } from "@/lib/data/workspace-tx";
import { enqueue } from "@/lib/jobs/queue";
import { getPlan } from "@/lib/plans";

// Audit reads and manual reruns (FR-CRAWL-11/13).

const WEEK_MS = 7 * 24 * 60 * 60_000;

export async function manualAuditsUsed(db: PrismaClient | Tx, ctx: TenantContext, now = new Date()) {
  return db.auditRun.count({
    where: {
      workspaceId: ctx.workspaceId,
      trigger: "manual",
      createdAt: { gt: new Date(now.getTime() - WEEK_MS) },
      status: { not: "cancelled" },
    },
  });
}

export async function manualAuditAllowance(db: PrismaClient | Tx, ctx: TenantContext, now = new Date()) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: { planKey: true } });
  const allowed = getPlan(ws.planKey).manualAuditsPerWeek;
  const used = await manualAuditsUsed(db, ctx, now);
  return { allowed, used, left: Math.max(0, allowed - used) };
}

export async function requestManualAudit(db: PrismaClient, ctx: TenantContext, siteId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    // Checks and the new run happen under the workspace lock, so concurrent
    // requests can't each see allowance left and all start an audit.
    await lockWorkspace(tx, ctx.workspaceId);
    const site = await tx.site.findFirst({
      where: { id: siteId, workspaceId: ctx.workspaceId },
      select: { status: true },
    });
    if (!site) throw notFound("website");
    if (site.status !== "active") throw new UserFacingError("Resume monitoring to run an audit.", "invalid");
    await assertCanOperate(tx, ctx, now);
    const busy = await tx.auditRun.findFirst({
      where: { siteId, status: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (busy) throw new UserFacingError("An audit for this website is already queued or running.", "duplicate");
    const { allowed, left } = await manualAuditAllowance(tx, ctx, now);
    if (left <= 0) {
      throw new UserFacingError(
        `You’ve used this week’s ${allowed} manual audit${allowed === 1 ? "" : "s"}. Scheduled audits continue as normal.`,
        "rate_limited",
      );
    }
    const run = await tx.auditRun.create({
      data: { workspaceId: ctx.workspaceId, siteId, status: "queued", trigger: "manual" },
    });
    const queued = await enqueue(tx, [
      {
        workspaceId: ctx.workspaceId,
        jobType: "site_audit",
        resourceType: "site",
        resourceId: siteId,
        payload: { auditRunId: run.id },
        priority: 5,
        maxAttempts: 1,
        runAt: now,
      },
    ]);
    // A scheduled audit is already waiting to run; throwing rolls the new run back.
    if (!queued) throw new UserFacingError("An audit for this website is already queued.", "duplicate");
    return { runId: run.id };
  });
}

export async function latestAudit(db: PrismaClient, ctx: TenantContext, siteId: string) {
  return db.auditRun.findFirst({
    where: { workspaceId: ctx.workspaceId, siteId },
    orderBy: { createdAt: "desc" },
  });
}

/** Most recent finished audit (completed, partial or failed). */
export async function lastFinishedAudit(db: PrismaClient, ctx: TenantContext, siteId: string) {
  return db.auditRun.findFirst({
    where: { workspaceId: ctx.workspaceId, siteId, status: { in: ["completed", "partial", "failed"] } },
    orderBy: { createdAt: "desc" },
  });
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export async function openFindings(db: PrismaClient, ctx: TenantContext, siteId: string, take = 200) {
  const rows = await db.auditFinding.findMany({
    where: { workspaceId: ctx.workspaceId, siteId, resolvedAt: null },
    orderBy: [{ firstSeenAt: "asc" }],
    take: 1000,
    select: {
      id: true,
      type: true,
      severity: true,
      summary: true,
      sourceUrl: true,
      targetUrl: true,
      statusCode: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });
  const total = rows.length;
  rows.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.firstSeenAt.getTime() - b.firstSeenAt.getTime(),
  );
  return { items: rows.slice(0, take), total };
}

export async function recentlyResolvedFindings(db: PrismaClient, ctx: TenantContext, siteId: string, since: Date) {
  return db.auditFinding.count({ where: { workspaceId: ctx.workspaceId, siteId, resolvedAt: { gte: since } } });
}

/** A scheduled or manual audit job waiting for a crawler slot. */
export async function auditQueued(db: PrismaClient, ctx: TenantContext, siteId: string) {
  const job = await db.job.findFirst({
    where: { workspaceId: ctx.workspaceId, activeKey: `site_audit:${siteId}`, status: { in: ["pending", "running"] } },
    select: { status: true },
  });
  return job?.status ?? null;
}
