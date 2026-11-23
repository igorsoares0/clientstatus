import type { PrismaClient } from "@/lib/generated/prisma/client";
import { runAudit } from "@/lib/audit/run-audit";
import { sendQueuedEmail } from "@/lib/notify/send";
import { generateReport } from "@/lib/reports/generate";
import { sendReport } from "@/lib/reports/send";
import type { CrawlLimits } from "@/lib/crawler/crawl";
import type { ClaimedJob } from "@/lib/jobs/queue";
import { recordDomain, recordNoSsl, recordSsl, recordUptime, type SiteRef } from "@/lib/monitoring/apply";
import { classifyError, classifyResponse } from "@/lib/monitoring/classify";
import { lookupDomainExpiry, type JsonFetcher } from "@/lib/monitoring/rdap";
import { rdapFetcher } from "@/lib/monitoring/rdap-fetch";
import { safeFetch, type SafeFetchOptions } from "@/lib/monitoring/safe-fetch";
import { prune } from "@/lib/monitoring/scheduler";
import { checkCertificate } from "@/lib/monitoring/tls-check";
import { getPlan } from "@/lib/plans";
import { runToolJob } from "@/lib/tools/jobs";
import { TOOL_JOB } from "@/lib/tools/runs";

export type HandlerDeps = {
  now: () => Date;
  /** Test seams for outbound network access. */
  fetch?: Pick<SafeFetchOptions, "resolver" | "allowPrivate">;
  rdapFetch?: JsonFetcher;
  tlsPort?: number;
  sleep?: (ms: number) => Promise<void>;
  auditLimits?: Partial<CrawlLimits>;
  /** Set by the runner per job: extends the job's lease. */
  heartbeat?: () => Promise<void>;
};

const TLS_TIMEOUT_MS = 10_000;

async function loadSite(db: PrismaClient, siteId: string) {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      baseUrl: true,
      registrableDomain: true,
      timeoutMs: true,
      downPolicy: true,
      workspace: { select: { planKey: true, timezone: true } },
    },
  });
  // Paused or archived since the job was queued: nothing to do.
  if (!site || site.status !== "active") return null;
  const ref: SiteRef = {
    id: site.id,
    workspaceId: site.workspaceId,
    intervalMs: getPlan(site.workspace.planKey).uptimeIntervalSeconds * 1000,
  };
  return { site, ref };
}

export async function runJob(db: PrismaClient, job: ClaimedJob, deps: HandlerDeps): Promise<void> {
  switch (job.jobType) {
    case "uptime_check": {
      const loaded = await loadSite(db, job.resourceId);
      if (!loaded) return;
      const { site, ref } = loaded;
      const result = await safeFetch(site.baseUrl, { timeoutMs: site.timeoutMs, ...deps.fetch })
        .then((r) => classifyResponse(r, site.downPolicy))
        .catch((e) => classifyError(e, site.timeoutMs));
      await recordUptime(db, ref, result, deps.now());
      return;
    }
    case "ssl_check": {
      const loaded = await loadSite(db, job.resourceId);
      if (!loaded) return;
      const { site, ref } = loaded;
      const url = new URL(site.baseUrl);
      if (url.protocol !== "https:") return recordNoSsl(db, ref, deps.now());
      const result = await checkCertificate(
        url.hostname,
        {
          port: deps.tlsPort ?? (url.port ? Number(url.port) : 443),
          timeoutMs: TLS_TIMEOUT_MS,
          timeZone: site.workspace.timezone,
          ...deps.fetch,
        },
        deps.now(),
      );
      await recordSsl(db, ref, result, deps.now());
      return;
    }
    case "domain_check": {
      const loaded = await loadSite(db, job.resourceId);
      if (!loaded || !loaded.site.registrableDomain) return;
      const result = await lookupDomainExpiry(
        loaded.site.registrableDomain,
        deps.rdapFetch ?? rdapFetcher(deps.fetch),
        deps.now(),
        loaded.site.workspace.timezone,
      );
      await recordDomain(db, loaded.ref, result, deps.now());
      return;
    }
    case "site_audit":
      await runAudit(db, job, {
        now: deps.now,
        fetch: deps.fetch,
        sleep: deps.sleep,
        heartbeat: deps.heartbeat,
        limits: deps.auditLimits,
      });
      return;
    case "email_send":
      await sendQueuedEmail(db, job.resourceId, deps.now());
      return;
    case "report_generate":
      await generateReport(db, job.resourceId, { now: deps.now });
      return;
    case "report_send":
      await sendReport(db, job.resourceId, { now: deps.now, automatic: true });
      return;
    case "prune":
      await prune(db, deps.now());
      return;
    case TOOL_JOB["broken-link-checker"]:
    case TOOL_JOB["website-health-report"]:
      await runToolJob(db, job, {
        now: deps.now,
        fetch: deps.fetch,
        rdapFetch: deps.rdapFetch ?? rdapFetcher(deps.fetch),
        tlsPort: deps.tlsPort,
        sleep: deps.sleep,
        heartbeat: deps.heartbeat,
        limits: deps.auditLimits,
      });
      return;
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}
