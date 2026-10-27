import type { PrismaClient } from "@/lib/generated/prisma/client";
import { claimJobs, completeJob, extendLease, failJob, recoverExpiredLeases, type ClaimedJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/log";
import { markEmailFailed } from "@/lib/notify/send";
import { runJob, type HandlerDeps } from "@/lib/monitoring/handlers";
import { scheduleDueWork } from "@/lib/monitoring/scheduler";

const log = logger("runner");

export type RunnerOptions = {
  workerId: string;
  /** Concurrent checks (uptime, SSL, domain, housekeeping). */
  concurrency: number;
  /** Concurrent audits — long crawls get their own lane so they never starve checks. */
  auditConcurrency?: number;
  deps: HandlerDeps;
};

/** Long jobs (crawls, PDF rendering) get their own lane so they never starve checks and emails. */
const LONG_TYPES = ["site_audit", "report_generate"];

/** Records give-ups on the domain row too, so the UI can show them. */
async function onFinalFailure(db: PrismaClient, job: ClaimedJob) {
  if (job.jobType === "email_send") await markEmailFailed(db, job.resourceId);
  if (job.jobType === "report_generate") {
    await db.monthlyReport.updateMany({
      where: { id: job.resourceId, status: "generating" },
      data: { status: "failed" },
    });
  }
}

/**
 * One pass: recover expired leases, schedule due checks, claim and run jobs up
 * to the free concurrency. Monitoring failures for one site never block others.
 */
export function createRunner(db: PrismaClient, opts: RunnerOptions) {
  const inFlight = new Set<Promise<void>>();
  const auditsInFlight = new Set<Promise<void>>();

  async function execute(job: ClaimedJob) {
    const started = Date.now();
    try {
      await runJob(db, job, { ...opts.deps, heartbeat: () => extendLease(db, job.id, opts.workerId, opts.deps.now()) });
      await completeJob(db, job.id, opts.workerId);
      log.debug("job completed", { jobId: job.id, jobType: job.jobType, ms: Date.now() - started });
    } catch (error) {
      const outcome = await failJob(db, job, opts.workerId, error).catch(() => "unknown");
      if (outcome === "failed") await onFinalFailure(db, job).catch(() => undefined);
      log.error("job failed", { jobId: job.id, jobType: job.jobType, attempt: job.attempts, outcome, error });
    }
  }

  return {
    get inFlight() {
      return inFlight.size + auditsInFlight.size;
    },
    async schedule() {
      const now = opts.deps.now();
      const recovered = await recoverExpiredLeases(db, now);
      if (recovered.failed || recovered.requeued) log.warn("recovered expired leases", recovered);
      return scheduleDueWork(db, now);
    },
    /** Claims as many jobs as there is free capacity for, per lane, and starts them. */
    async claim() {
      let started = 0;
      const lanes = [
        { set: inFlight, limit: opts.concurrency, filter: { exclude: LONG_TYPES } },
        { set: auditsInFlight, limit: opts.auditConcurrency ?? 2, filter: { only: LONG_TYPES } },
      ];
      for (const lane of lanes) {
        const free = lane.limit - lane.set.size;
        if (free <= 0) continue;
        const jobs = await claimJobs(db, opts.workerId, free, opts.deps.now(), lane.filter);
        for (const job of jobs) {
          const p = execute(job).finally(() => lane.set.delete(p));
          lane.set.add(p);
        }
        started += jobs.length;
      }
      return started;
    },
    /** Claims and starts jobs of specific types only (scripts and tests). */
    async claimTypes(types: string[]) {
      const jobs = await claimJobs(db, opts.workerId, opts.concurrency, opts.deps.now(), { only: types });
      for (const job of jobs) {
        const p = execute(job).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      return jobs.length;
    },
    /** Waits for running jobs (graceful shutdown and tests). */
    async drain() {
      await Promise.allSettled([...inFlight, ...auditsInFlight]);
    },
  };
}
