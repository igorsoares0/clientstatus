import type { PrismaClient } from "@/lib/generated/prisma/client";
import { applyAuditResult } from "@/lib/audit/persist";
import { crawlSite, type CrawlLimits } from "@/lib/crawler/crawl";
import { sanitizeError, type ClaimedJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/log";
import { nextAudit } from "@/lib/monitoring/apply";
import { safeFetch, type SafeFetchOptions } from "@/lib/monitoring/safe-fetch";
import { getPlan } from "@/lib/plans";

const log = logger("audit");

export type AuditDeps = {
  now: () => Date;
  fetch?: Pick<SafeFetchOptions, "resolver" | "allowPrivate">;
  sleep?: (ms: number) => Promise<void>;
  heartbeat?: () => Promise<void>;
  /** Test seam: shrink delays and limits. */
  limits?: Partial<CrawlLimits>;
};

export const AUDIT_DEFAULTS = {
  timeoutMs: 10_000,
  delayMs: 500,
  hostConcurrency: 4,
  retryDelayMs: 3_000,
} as const;

type CrawlConfig = { respectRobots?: boolean };

export async function runAudit(db: PrismaClient, job: ClaimedJob, deps: AuditDeps): Promise<void> {
  const site = await db.site.findUnique({
    where: { id: job.resourceId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      baseUrl: true,
      crawlConfig: true,
      workspace: { select: { planKey: true } },
    },
  });
  const payloadRunId = (job.payload as { auditRunId?: string } | null)?.auditRunId;
  if (!site || site.status !== "active") {
    if (payloadRunId)
      await db.auditRun.updateMany({
        where: { id: payloadRunId, status: "queued" },
        data: { status: "cancelled", completedAt: deps.now() },
      });
    return;
  }
  const plan = getPlan(site.workspace.planKey);
  const trigger = payloadRunId ? "manual" : "scheduled";
  const startedAt = deps.now();
  const run = payloadRunId
    ? await db.auditRun.update({ where: { id: payloadRunId }, data: { status: "running", startedAt } })
    : await db.auditRun.create({
        data: {
          workspaceId: site.workspaceId,
          siteId: site.id,
          status: "running",
          trigger,
          startedAt,
          pagesBudget: plan.maxPagesPerAudit,
        },
      });
  await db.siteState.upsert({
    where: { siteId: site.id },
    create: { siteId: site.id, workspaceId: site.workspaceId, lastAuditStatus: "running", lastAuditRunId: run.id },
    update: { lastAuditStatus: "running", lastAuditRunId: run.id },
  });

  const config = (site.crawlConfig ?? {}) as CrawlConfig;
  const limits: CrawlLimits = {
    ...AUDIT_DEFAULTS,
    maxPages: plan.maxPagesPerAudit,
    maxDepth: plan.maxAuditDepth,
    maxRequests: plan.maxRequestsPerAudit,
    maxRuntimeMs: plan.maxAuditMinutes * 60_000,
    respectRobots: config.respectRobots !== false,
    ...deps.limits,
  };
  const ref = { id: site.id, workspaceId: site.workspaceId, intervalMs: plan.uptimeIntervalSeconds * 1000 };

  try {
    const result = await crawlSite(site.baseUrl, limits, {
      fetch: (url, o) => safeFetch(url, { timeoutMs: o.timeoutMs, maxBytes: o.maxBytes, ...deps.fetch }),
      clock: () => deps.now().getTime(),
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      heartbeat: deps.heartbeat,
    });
    const finished = deps.now();
    await applyAuditResult(db, ref, run.id, result, limits.maxPages, finished);
    log.info("audit finished", {
      siteId: site.id,
      status: result.status,
      pages: result.pagesVisited,
      requests: result.requests,
    });
  } catch (error) {
    log.error("audit failed", { siteId: site.id, error });
    await db.auditRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: deps.now(), errorSummary: sanitizeError(error) },
    });
    await db.siteState.update({
      where: { siteId: site.id },
      data: { lastAuditAt: deps.now(), lastAuditStatus: "failed" },
    });
  } finally {
    // Manual runs don't move the regular schedule.
    if (trigger === "scheduled") {
      await db.siteState.update({
        where: { siteId: site.id },
        data: { nextAuditAt: nextAudit(site.id, deps.now(), plan.auditEveryDays) },
      });
    }
  }
}
