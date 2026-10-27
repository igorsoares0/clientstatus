import { assertCanOperate } from "@/lib/billing/access";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { notFound, UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";
import { enqueue } from "@/lib/jobs/queue";
import { computeUptime, type CheckCounts, type Uptime } from "@/lib/monitoring/uptime";

// Monitoring reads for the UI. Every query is scoped by workspace.

export const PERIODS = { "24h": 24 * 3600_000, "7d": 7 * 24 * 3600_000, "30d": 30 * 24 * 3600_000 } as const;
export type Period = keyof typeof PERIODS;

const emptyCounts = (): CheckCounts => ({ success: 0, failure: 0, inconclusive: 0 });

/** Uptime per site over a period, from stored uptime checks. */
export async function uptimeBySite(
  db: PrismaClient,
  ctx: TenantContext,
  siteIds: string[],
  period: Period,
  now = new Date(),
): Promise<Map<string, CheckCounts>> {
  const map = new Map<string, CheckCounts>();
  if (siteIds.length === 0) return map;
  const rows = await db.monitorCheck.groupBy({
    by: ["siteId", "status"],
    where: {
      workspaceId: ctx.workspaceId,
      siteId: { in: siteIds },
      checkType: "uptime",
      checkedAt: { gte: new Date(now.getTime() - PERIODS[period]) },
    },
    _count: true,
  });
  for (const r of rows) {
    const c = map.get(r.siteId) ?? emptyCounts();
    c[r.status] = r._count;
    map.set(r.siteId, c);
  }
  return map;
}

export async function openIncidentCounts(db: PrismaClient, ctx: TenantContext, siteIds: string[]) {
  if (siteIds.length === 0) return new Map<string, number>();
  const rows = await db.incident.groupBy({
    by: ["siteId"],
    where: { workspaceId: ctx.workspaceId, siteId: { in: siteIds }, status: { not: "resolved" } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.siteId, r._count]));
}

/** Newest check result in the workspace — the status bar's "Newest result". */
export async function newestResultAt(db: PrismaClient, ctx: TenantContext): Promise<Date | null> {
  const row = await db.siteState.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { lastCheckAt: true } });
  return row._max.lastCheckAt;
}

export async function nextSslSweepAt(db: PrismaClient, ctx: TenantContext): Promise<Date | null> {
  const row = await db.siteState.aggregate({
    where: { workspaceId: ctx.workspaceId, site: { status: "active" } },
    _min: { nextSslCheckAt: true },
  });
  return row._min.nextSslCheckAt;
}

export type Bucket = { start: Date; success: number; failure: number; inconclusive: number };

const BUCKETS: Record<Period, { count: number; ms: number }> = {
  "24h": { count: 96, ms: 15 * 60_000 },
  "7d": { count: 168, ms: 3600_000 },
  "30d": { count: 120, ms: 6 * 3600_000 },
};

/** Fixed-size strip of check buckets for a site; empty buckets mean no data (never "up"). */
export async function uptimeBuckets(
  db: PrismaClient,
  ctx: TenantContext,
  siteId: string,
  period: Period,
  now = new Date(),
) {
  const { count, ms } = BUCKETS[period];
  const end = Math.ceil(now.getTime() / ms) * ms;
  const start = new Date(end - count * ms);
  const rows = await db.$queryRaw<{ idx: number; status: string; n: bigint }[]>`
    SELECT floor(extract(epoch from ("checkedAt" - ${start}::timestamptz)) * 1000 / ${ms})::int AS idx, "status"::text AS status, count(*) AS n
    FROM "monitor_check"
    WHERE "workspaceId" = ${ctx.workspaceId} AND "siteId" = ${siteId} AND "checkType" = 'uptime'
      AND "checkedAt" >= ${start} AND "checkedAt" < ${new Date(end)}
    GROUP BY 1, 2`;
  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => ({
    start: new Date(start.getTime() + i * ms),
    success: 0,
    failure: 0,
    inconclusive: 0,
  }));
  for (const r of rows) {
    const b = buckets[r.idx];
    if (b && (r.status === "success" || r.status === "failure" || r.status === "inconclusive"))
      b[r.status] += Number(r.n);
  }
  return { buckets, bucketMs: ms, start };
}

export async function siteUptime(
  db: PrismaClient,
  ctx: TenantContext,
  site: { id: string; createdAt: Date },
  period: Period,
  intervalMs: number,
  now = new Date(),
): Promise<Uptime> {
  const counts = (await uptimeBySite(db, ctx, [site.id], period, now)).get(site.id) ?? emptyCounts();
  const from = Math.max(now.getTime() - PERIODS[period], site.createdAt.getTime());
  const expected = Math.floor((now.getTime() - from) / intervalMs);
  return computeUptime(counts, expected);
}

/** Median response time of successful uptime checks in the last 24 h. */
export async function medianResponse(db: PrismaClient, ctx: TenantContext, siteId: string, now = new Date()) {
  const rows = await db.$queryRaw<{ median: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median
    FROM "monitor_check"
    WHERE "workspaceId" = ${ctx.workspaceId} AND "siteId" = ${siteId} AND "checkType" = 'uptime'
      AND "status" = 'success' AND "durationMs" IS NOT NULL AND "checkedAt" >= ${new Date(now.getTime() - PERIODS["24h"])}`;
  const m = rows[0]?.median;
  return m === null || m === undefined ? null : Math.round(Number(m));
}

export async function recentChecks(db: PrismaClient, ctx: TenantContext, siteId: string, take = 10) {
  return db.monitorCheck.findMany({
    where: { workspaceId: ctx.workspaceId, siteId },
    orderBy: { checkedAt: "desc" },
    take,
    select: { id: true, checkType: true, status: true, checkedAt: true, summary: true, durationMs: true },
  });
}

const MANUAL_CHECK_COOLDOWN_MS = 60_000;

/** "Run check now": queues a high-priority uptime check, at most once a minute per site. */
export async function requestManualCheck(db: PrismaClient, ctx: TenantContext, siteId: string, now = new Date()) {
  const site = await db.site.findFirst({
    where: { id: siteId, workspaceId: ctx.workspaceId },
    select: { status: true, state: { select: { manualCheckAfter: true } } },
  });
  if (!site) throw notFound("website");
  if (site.status !== "active") throw new UserFacingError("Resume monitoring to run a check.", "invalid");
  await assertCanOperate(db, ctx, now);
  const after = site.state?.manualCheckAfter;
  if (after && after > now) {
    const s = Math.ceil((after.getTime() - now.getTime()) / 1000);
    throw new UserFacingError(`A check was just requested. Try again in ${s} s.`, "rate_limited");
  }
  await db.siteState.upsert({
    where: { siteId },
    create: {
      siteId,
      workspaceId: ctx.workspaceId,
      manualCheckAfter: new Date(now.getTime() + MANUAL_CHECK_COOLDOWN_MS),
    },
    update: { manualCheckAfter: new Date(now.getTime() + MANUAL_CHECK_COOLDOWN_MS) },
  });
  const queued = await enqueue(db, [
    {
      workspaceId: ctx.workspaceId,
      jobType: "uptime_check",
      resourceType: "site",
      resourceId: siteId,
      priority: 10,
      runAt: now,
      maxAttempts: 2,
    },
  ]);
  return { queued: queued > 0 };
}
