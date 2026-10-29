import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";

// Persistent PostgreSQL job queue (spec §6.4): atomic claims with SKIP LOCKED,
// leases that expire if a worker dies, bounded retries with exponential
// backoff, and `activeKey` so the same work is never queued twice.

export const LEASE_MS = 5 * 60_000;
const BACKOFF_BASE_MS = 30_000;
const MAX_ERROR_LENGTH = 500;

export type ClaimedJob = {
  id: string;
  workspaceId: string | null;
  jobType: string;
  resourceType: string;
  resourceId: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  /** When the job was due (queue-age metrics and the load test). */
  runAt: Date;
};

export type NewJob = {
  workspaceId?: string | null;
  jobType: string;
  resourceType: string;
  resourceId: string;
  payload?: Prisma.InputJsonValue;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  /** Defaults to "<jobType>:<resourceId>". Pass null to allow duplicates. */
  activeKey?: string | null;
};

function toData(job: NewJob): Prisma.JobCreateManyInput {
  return {
    workspaceId: job.workspaceId ?? null,
    jobType: job.jobType,
    resourceType: job.resourceType,
    resourceId: job.resourceId,
    payload: job.payload,
    priority: job.priority ?? 0,
    runAt: job.runAt ?? new Date(),
    maxAttempts: job.maxAttempts ?? 3,
    activeKey: job.activeKey === undefined ? `${job.jobType}:${job.resourceId}` : job.activeKey,
  };
}

/** Enqueues jobs, silently skipping ones whose activeKey is already pending or running. Returns how many were added. */
export async function enqueue(db: Pick<PrismaClient, "job">, jobs: NewJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const { count } = await db.job.createMany({ data: jobs.map(toData), skipDuplicates: true });
  return count;
}

export type ClaimFilter = { only?: string[]; exclude?: string[] };

/** Atomically claims up to `limit` due jobs for this worker, optionally limited to some job types. */
export async function claimJobs(
  db: PrismaClient,
  workerId: string,
  limit: number,
  now = new Date(),
  filter: ClaimFilter = {},
): Promise<ClaimedJob[]> {
  const typeFilter = filter.only?.length
    ? Prisma.sql`AND "jobType" = ANY(${filter.only})`
    : filter.exclude?.length
      ? Prisma.sql`AND NOT ("jobType" = ANY(${filter.exclude}))`
      : Prisma.empty;
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE "job" SET
      "status" = 'running',
      "lockedAt" = ${now},
      "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1,
      "startedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "job"
      WHERE "status" = 'pending' AND "runAt" <= ${now} ${typeFilter}
      ORDER BY "priority" DESC, "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "workspaceId", "jobType", "resourceType", "resourceId", "payload", "attempts", "maxAttempts", "runAt"`;
}

/** Keeps a long-running job's lease alive. */
export async function extendLease(db: PrismaClient, jobId: string, workerId: string, now = new Date()) {
  await db.job.updateMany({ where: { id: jobId, lockedBy: workerId, status: "running" }, data: { lockedAt: now } });
}

export async function completeJob(db: PrismaClient, jobId: string, workerId: string, now = new Date()) {
  await db.job.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "running" },
    data: { status: "completed", completedAt: now, lockedAt: null, activeKey: null, lastError: null },
  });
}

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // Strip URLs' query strings and anything token-like before storing.
  return message
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, MAX_ERROR_LENGTH);
}

/** Retries with exponential backoff until maxAttempts, then marks the job failed. */
export async function failJob(db: PrismaClient, job: ClaimedJob, workerId: string, error: unknown, now = new Date()) {
  const lastError = sanitizeError(error);
  if (job.attempts >= job.maxAttempts) {
    await db.job.updateMany({
      where: { id: job.id, lockedBy: workerId },
      data: { status: "failed", completedAt: now, lockedAt: null, activeKey: null, lastError },
    });
    return "failed" as const;
  }
  const delay = BACKOFF_BASE_MS * 2 ** (job.attempts - 1);
  await db.job.updateMany({
    where: { id: job.id, lockedBy: workerId },
    data: { status: "pending", runAt: new Date(now.getTime() + delay), lockedAt: null, lockedBy: null, lastError },
  });
  return "retrying" as const;
}

/** Returns jobs whose lease expired (worker crashed or hung) to the queue, or fails them if out of attempts. */
export async function recoverExpiredLeases(db: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - LEASE_MS);
  const failed = await db.$executeRaw`
    UPDATE "job" SET "status" = 'failed', "completedAt" = ${now}, "lockedAt" = NULL, "activeKey" = NULL,
      "lastError" = 'Lease expired after final attempt', "updatedAt" = ${now}
    WHERE "status" = 'running' AND "lockedAt" < ${cutoff} AND "attempts" >= "maxAttempts"`;
  const requeued = await db.$executeRaw`
    UPDATE "job" SET "status" = 'pending', "lockedAt" = NULL, "lockedBy" = NULL, "runAt" = ${now},
      "lastError" = 'Lease expired — requeued', "updatedAt" = ${now}
    WHERE "status" = 'running' AND "lockedAt" < ${cutoff}`;
  return { failed, requeued };
}

/** Internal queue metrics (FR-OPS-03). Never shown to customers. */
export async function queueMetrics(db: PrismaClient, now = new Date()) {
  const [pending, running, failed24h, oldest] = await Promise.all([
    db.job.count({ where: { status: "pending", runAt: { lte: now } } }),
    db.job.count({ where: { status: "running" } }),
    db.job.count({ where: { status: "failed", completedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    db.job.findFirst({
      where: { status: "pending", runAt: { lte: now } },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
  ]);
  return {
    pendingDue: pending,
    running,
    failedLast24h: failed24h,
    oldestDueAgeSeconds: oldest ? Math.round((now.getTime() - oldest.runAt.getTime()) / 1000) : 0,
  };
}

export type RequeueResult = "requeued" | "not_failed" | "busy";

/**
 * Safely retries a failed job (FR-OPS-04): fresh attempts, due now, and the
 * domain row it gave up on goes back to its in-progress state. Refuses when the
 * same work is already pending or running, so nothing runs twice.
 */
export async function requeueFailedJob(db: PrismaClient, jobId: string, now = new Date()): Promise<RequeueResult> {
  try {
    return await db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job || job.status !== "failed") return "not_failed";
      await tx.job.update({
        where: { id: jobId },
        data: {
          status: "pending",
          attempts: 0,
          runAt: now,
          completedAt: null,
          lockedAt: null,
          lockedBy: null,
          lastError: "Requeued manually",
          activeKey: `${job.jobType}:${job.resourceId}`,
        },
      });
      if (job.jobType === "email_send") {
        await tx.emailDelivery.updateMany({
          where: { id: job.resourceId, status: "failed" },
          data: { status: "pending" },
        });
      }
      if (job.jobType === "report_generate") {
        await tx.monthlyReport.updateMany({
          where: { id: job.resourceId, status: "failed" },
          data: { status: "generating", errorSummary: null },
        });
      }
      return "requeued";
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "busy";
    throw error;
  }
}
