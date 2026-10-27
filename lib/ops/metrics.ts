import type { PrismaClient } from "@/lib/generated/prisma/client";
import { HEARTBEAT_STALE_MS } from "@/lib/heartbeat";
import { queueMetrics } from "@/lib/jobs/queue";

// Internal operational metrics (FR-OPS-03): queue depth and job age, check
// latency and error rate, email delivery failures, billing webhook outcomes.
// Used by the /ops page and the worker's /metrics endpoint. Never per-customer
// content, only counts.

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export async function opsMetrics(db: PrismaClient, now = new Date()) {
  const hourAgo = new Date(now.getTime() - HOUR);
  const dayAgo = new Date(now.getTime() - DAY);
  const [queue, byType, workers, checks, latency, emails, billing, failedReports, workspaces] = await Promise.all([
    queueMetrics(db, now),
    db.$queryRaw<{ jobType: string; pending: bigint; running: bigint; oldest: Date | null }[]>`
      SELECT "jobType",
             COUNT(*) FILTER (WHERE status = 'pending' AND "runAt" <= ${now}) AS pending,
             COUNT(*) FILTER (WHERE status = 'running') AS running,
             MIN("runAt") FILTER (WHERE status = 'pending' AND "runAt" <= ${now}) AS oldest
      FROM "job" WHERE status IN ('pending', 'running')
      GROUP BY "jobType" ORDER BY "jobType"`,
    db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 20 }),
    db.monitorCheck.groupBy({ by: ["checkType", "status"], where: { checkedAt: { gte: hourAgo } }, _count: true }),
    db.$queryRaw<{ p50: number | null; p95: number | null; n: bigint }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95,
             COUNT(*) AS n
      FROM "monitor_check"
      WHERE "checkType" = 'uptime' AND "checkedAt" >= ${hourAgo} AND "durationMs" IS NOT NULL`,
    db.emailDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: dayAgo } }, _count: true }),
    db.billingEvent.groupBy({ by: ["outcome"], where: { processedAt: { gte: dayAgo } }, _count: true }),
    db.monthlyReport.count({ where: { status: "failed", updatedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.$queryRaw<{ paid: bigint; trial: bigint; past_due: bigint; lapsed: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE s.status IN ('active', 'trialing') AND (w."accessEndsAt" IS NULL OR w."accessEndsAt" > ${now})) AS paid,
             COUNT(*) FILTER (WHERE s.id IS NULL AND (w."accessEndsAt" IS NULL OR w."accessEndsAt" > ${now})) AS trial,
             COUNT(*) FILTER (WHERE s.status = 'past_due' AND w."accessEndsAt" > ${now}) AS past_due,
             COUNT(*) FILTER (WHERE w."accessEndsAt" <= ${now}) AS lapsed
      FROM "workspace" w LEFT JOIN "subscription" s ON s."workspaceId" = w.id`,
  ]);

  const checkCounts = { success: 0, failure: 0, inconclusive: 0 };
  for (const row of checks) checkCounts[row.status] += row._count;
  const totalChecks = checkCounts.success + checkCounts.failure + checkCounts.inconclusive;
  const emailCounts = Object.fromEntries(emails.map((e) => [e.status, e._count])) as Record<string, number>;
  const ws = workspaces[0];

  return {
    generatedAt: now.toISOString(),
    queue: {
      ...queue,
      byType: byType.map((r) => ({
        jobType: r.jobType,
        pendingDue: Number(r.pending),
        running: Number(r.running),
        oldestDueAgeSeconds: r.oldest ? Math.round((now.getTime() - r.oldest.getTime()) / 1000) : 0,
      })),
    },
    workers: workers.map((w) => ({
      workerId: w.workerId,
      startedAt: w.startedAt.toISOString(),
      lastSeenAt: w.lastSeenAt.toISOString(),
      alive: now.getTime() - w.lastSeenAt.getTime() <= HEARTBEAT_STALE_MS,
    })),
    checksLastHour: {
      ...checkCounts,
      total: totalChecks,
      /** Share of checks that failed (inconclusive ones are reported separately, never as errors). */
      failureRate: totalChecks ? checkCounts.failure / totalChecks : 0,
      inconclusiveRate: totalChecks ? checkCounts.inconclusive / totalChecks : 0,
      uptimeLatencyMs: {
        p50: latency[0]?.p50 === null || latency[0]?.p50 === undefined ? null : Math.round(latency[0].p50),
        p95: latency[0]?.p95 === null || latency[0]?.p95 === undefined ? null : Math.round(latency[0].p95),
        samples: Number(latency[0]?.n ?? 0),
      },
    },
    emailsLast24h: {
      sent: emailCounts.sent ?? 0,
      pending: emailCounts.pending ?? 0,
      failed: emailCounts.failed ?? 0,
      bounced: emailCounts.bounced ?? 0,
      suppressed: emailCounts.suppressed ?? 0,
    },
    billingEventsLast24h: Object.fromEntries(billing.map((b) => [b.outcome, b._count])) as Record<string, number>,
    failedReportsLast7d: failedReports,
    workspaces: {
      paid: Number(ws?.paid ?? 0),
      trial: Number(ws?.trial ?? 0),
      pastDue: Number(ws?.past_due ?? 0),
      lapsed: Number(ws?.lapsed ?? 0),
    },
  };
}

export type OpsMetrics = Awaited<ReturnType<typeof opsMetrics>>;

export async function recentFailedJobs(db: PrismaClient, now = new Date(), take = 50) {
  return db.job.findMany({
    where: { status: "failed", completedAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    orderBy: { completedAt: "desc" },
    take,
    select: {
      id: true,
      jobType: true,
      resourceType: true,
      resourceId: true,
      workspaceId: true,
      attempts: true,
      lastError: true,
      completedAt: true,
    },
  });
}
