import type { PrismaClient } from "@/lib/generated/prisma/client";
import { workspaceWithAccess } from "@/lib/billing/access";
import { enqueue, type NewJob } from "@/lib/jobs/queue";
import { queueReminders } from "@/lib/notify/reminders";
import { getPlan } from "@/lib/plans";
import { scheduleMonthlyReports } from "@/lib/reports/schedule";

// Turns due site state into queued jobs. Safe to run from several workers:
// activeKey dedupes jobs, and next*At is pushed forward provisionally so a due
// site isn't picked up again while its job waits (the handler sets the real time).

const BATCH = 500;
const PROVISIONAL_SSL_MS = 60 * 60_000;
const PROVISIONAL_DOMAIN_MS = 6 * 60 * 60_000;
const PROVISIONAL_AUDIT_MS = 24 * 60 * 60_000;
const SLOW_TICK_MS = 60_000;
let lastSlowTick = 0;

/** Test seam: run the once-a-minute work on the next tick. */
export function resetSlowTick() {
  lastSlowTick = 0;
}
export const RETENTION_DAYS = 90;

export async function ensureSiteStates(db: PrismaClient, now = new Date()) {
  return db.$executeRaw`
    INSERT INTO "site_state" ("siteId", "workspaceId", "nextCheckAt", "nextSslCheckAt", "nextDomainCheckAt", "nextAuditAt", "updatedAt")
    SELECT s."id", s."workspaceId", ${now}, ${now}, ${now}, ${now}, ${now}
    FROM "site" s
    WHERE s."status" = 'active' AND NOT EXISTS (SELECT 1 FROM "site_state" st WHERE st."siteId" = s."id")`;
}

export async function scheduleDueWork(db: PrismaClient, now = new Date()) {
  await ensureSiteStates(db, now);
  // Only websites of workspaces with an active plan or trial are monitored (FR-BILL-06).
  const activeSite = { status: "active" as const, workspace: workspaceWithAccess(now) };

  const [uptimeDue, sslDue, domainDue, auditDue] = await Promise.all([
    db.siteState.findMany({
      where: { nextCheckAt: { lte: now }, site: activeSite },
      orderBy: { nextCheckAt: "asc" },
      take: BATCH,
      select: {
        siteId: true,
        workspaceId: true,
        nextCheckAt: true,
        site: { select: { workspace: { select: { planKey: true } } } },
      },
    }),
    db.siteState.findMany({
      where: { nextSslCheckAt: { lte: now }, site: activeSite },
      orderBy: { nextSslCheckAt: "asc" },
      take: BATCH,
      select: { siteId: true, workspaceId: true },
    }),
    db.siteState.findMany({
      where: { nextDomainCheckAt: { lte: now }, site: activeSite },
      orderBy: { nextDomainCheckAt: "asc" },
      take: BATCH,
      select: { siteId: true, workspaceId: true },
    }),
    db.siteState.findMany({
      where: { nextAuditAt: { lte: now }, site: activeSite },
      orderBy: { nextAuditAt: "asc" },
      take: BATCH,
      select: { siteId: true, workspaceId: true },
    }),
  ]);

  const jobs: NewJob[] = [
    ...uptimeDue.map((s) => ({
      workspaceId: s.workspaceId,
      jobType: "uptime_check",
      resourceType: "site",
      resourceId: s.siteId,
      priority: 5,
      maxAttempts: 2,
      // The real due time, not this tick, so job age measures how late the check actually is.
      runAt: s.nextCheckAt,
    })),
    ...sslDue.map((s) => ({
      workspaceId: s.workspaceId,
      jobType: "ssl_check",
      resourceType: "site",
      resourceId: s.siteId,
      priority: 2,
    })),
    ...domainDue.map((s) => ({
      workspaceId: s.workspaceId,
      jobType: "domain_check",
      resourceType: "site",
      resourceId: s.siteId,
      priority: 1,
    })),
    // Audits aren't retried automatically: a failed crawl is recorded and the next one is scheduled.
    ...auditDue.map((s) => ({
      workspaceId: s.workspaceId,
      jobType: "site_audit",
      resourceType: "site",
      resourceId: s.siteId,
      priority: 0,
      maxAttempts: 1,
    })),
  ];
  const queued = await enqueue(
    db,
    jobs.map((j) => ({ ...j, runAt: j.runAt ?? now })),
  );

  // Provisional next times, grouped by plan interval.
  const byInterval = new Map<number, string[]>();
  for (const s of uptimeDue) {
    const ms = getPlan(s.site.workspace.planKey).uptimeIntervalSeconds * 1000;
    byInterval.set(ms, [...(byInterval.get(ms) ?? []), s.siteId]);
  }
  await Promise.all([
    ...[...byInterval].map(([ms, ids]) =>
      db.siteState.updateMany({ where: { siteId: { in: ids } }, data: { nextCheckAt: new Date(now.getTime() + ms) } }),
    ),
    sslDue.length
      ? db.siteState.updateMany({
          where: { siteId: { in: sslDue.map((s) => s.siteId) } },
          data: { nextSslCheckAt: new Date(now.getTime() + PROVISIONAL_SSL_MS) },
        })
      : null,
    auditDue.length
      ? db.siteState.updateMany({
          where: { siteId: { in: auditDue.map((s) => s.siteId) } },
          data: { nextAuditAt: new Date(now.getTime() + PROVISIONAL_AUDIT_MS) },
        })
      : null,
    domainDue.length
      ? db.siteState.updateMany({
          where: { siteId: { in: domainDue.map((s) => s.siteId) } },
          data: { nextDomainCheckAt: new Date(now.getTime() + PROVISIONAL_DOMAIN_MS) },
        })
      : null,
  ]);

  // Daily housekeeping.
  const lastPrune = await db.job.findFirst({
    where: { jobType: "prune", createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) } },
    select: { id: true },
  });
  if (!lastPrune) {
    await enqueue(db, [{ jobType: "prune", resourceType: "system", resourceId: "daily", priority: -1, runAt: now }]);
  }

  // Repeat alerts and monthly reports don't need second-level precision.
  let reminders = 0;
  let reports = 0;
  if (now.getTime() - lastSlowTick >= SLOW_TICK_MS) {
    lastSlowTick = now.getTime();
    reminders = await queueReminders(db, now);
    reports = await scheduleMonthlyReports(db, now);
  }

  return {
    uptime: uptimeDue.length,
    ssl: sslDue.length,
    domain: domainDue.length,
    audit: auditDue.length,
    queued,
    reminders,
    reports,
  };
}

/** Retention (spec §8.3): raw checks for RETENTION_DAYS, finished jobs for 7 days, expired rate-limit windows. */
export async function prune(db: PrismaClient, now = new Date()) {
  const checkCutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60_000);
  const jobCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const checks = await db.monitorCheck.deleteMany({ where: { checkedAt: { lt: checkCutoff } } });
  const jobs = await db.job.deleteMany({
    where: { status: { in: ["completed", "failed", "cancelled"] }, completedAt: { lt: jobCutoff } },
  });
  const emails = await db.emailDelivery.deleteMany({
    where: { status: { not: "pending" }, createdAt: { lt: checkCutoff } },
  });
  const limits = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } });
  return { checks: checks.count, jobs: jobs.count, emails: emails.count, rateLimits: limits.count };
}
