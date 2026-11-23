import { getDomain } from "tldts";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { actionEmail, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { sanitizeError, type ClaimedJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/log";
import { classifyError, classifyResponse } from "@/lib/monitoring/classify";
import { lookupDomainExpiry, type JsonFetcher } from "@/lib/monitoring/rdap";
import { safeFetch, type SafeFetchOptions } from "@/lib/monitoring/safe-fetch";
import { checkCertificate } from "@/lib/monitoring/tls-check";
import { htmlToPdf } from "@/lib/reports/pdf";
import { renderReportHtml } from "@/lib/reports/render";
import { runToolCrawl, summariseCrawl, type ToolCrawlDeps } from "@/lib/tools/crawl";
import { TOOL_JOB } from "@/lib/tools/runs";
import { buildSampleReport, SAMPLE_BRANDING } from "@/lib/tools/sample-report";

// Worker side of the free tools: runs queued broken-link checks and health reports. A failed run
// is recorded on the run (the page shows it) and never retried, so nobody gets two emails.

const log = logger("tools");

export type ToolJobDeps = Omit<ToolCrawlDeps, "now"> & {
  now: () => Date;
  fetch?: Pick<SafeFetchOptions, "resolver" | "allowPrivate">;
  rdapFetch: JsonFetcher;
  tlsPort?: number;
  /** Test seam: skip Chromium. */
  renderPdf?: (html: string) => Promise<Buffer>;
};

async function finish(db: PrismaClient, id: string, data: Prisma.ToolRunUpdateInput) {
  await db.toolRun.update({ where: { id }, data });
}

export async function runToolJob(db: PrismaClient, job: ClaimedJob, deps: ToolJobDeps): Promise<void> {
  const run = await db.toolRun.findUnique({ where: { id: job.resourceId } });
  if (!run || run.status !== "queued") return;
  await finish(db, run.id, { status: "running" });
  const crawlDeps: ToolCrawlDeps = {
    fetch: deps.fetch,
    sleep: deps.sleep,
    heartbeat: deps.heartbeat,
    limits: deps.limits,
    now: () => deps.now().getTime(),
  };
  try {
    if (job.jobType === TOOL_JOB["broken-link-checker"]) {
      const crawl = await runToolCrawl(run.url, crawlDeps);
      await finish(db, run.id, {
        status: "completed",
        completedAt: deps.now(),
        result: summariseCrawl(run.url, crawl) as unknown as Prisma.InputJsonValue,
      });
      return;
    }
    if (job.jobType === TOOL_JOB["website-health-report"]) {
      const lead = await db.toolLead.findFirst({ where: { toolRunId: run.id } });
      if (!lead) throw new Error("No lead for this run");
      await sendHealthReport(run.id, run.url, lead.email, deps, crawlDeps);
      await finish(db, run.id, { status: "completed", completedAt: deps.now(), result: { emailed: true } });
      return;
    }
    throw new Error(`Unknown tool job: ${job.jobType}`);
  } catch (error) {
    log.error("tool run failed", { runId: run.id, jobType: job.jobType, error });
    await finish(db, run.id, { status: "failed", completedAt: deps.now(), error: sanitizeError(error) });
  }
}

async function sendHealthReport(
  runId: string,
  url: string,
  email: string,
  deps: ToolJobDeps,
  crawlDeps: ToolCrawlDeps,
) {
  const checkedAt = deps.now();
  const parsed = new URL(url);
  const timeoutMs = 10_000;
  const [uptime, ssl, domain] = await Promise.all([
    safeFetch(url, { timeoutMs, ...deps.fetch })
      .then((r) => classifyResponse(r, "server_errors"))
      .catch((e) => classifyError(e, timeoutMs)),
    parsed.protocol === "https:"
      ? checkCertificate(parsed.hostname, { port: deps.tlsPort ?? 443, timeoutMs, ...deps.fetch }, checkedAt)
      : Promise.resolve(null),
    lookupDomainExpiry(registrable(parsed.hostname), deps.rdapFetch, checkedAt),
  ]);
  const crawl = await runToolCrawl(url, crawlDeps).catch((error) => {
    log.warn("health report crawl failed", { runId, error });
    return null;
  });
  const data = buildSampleReport({ url, checkedAt, uptime, ssl, domain, crawl });
  const html = renderReportHtml(data, SAMPLE_BRANDING, { forPdf: true });
  const pdf = await (deps.renderPdf ?? ((h) => htmlToPdf(h, { code: "SAMPLE" })))(html);
  const host = parsed.hostname.replace(/^www\./, "");
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const { text, html: body } = actionEmail({
    heading: `Your sample website health report for ${host}`,
    body: `The report is attached as a PDF. It’s built from one check of ${host}, so it shows what your clients would receive each month rather than a month of monitoring. With Client Status, every client gets this report on the 1st, with your agency’s branding.`,
    actionLabel: "Start your free trial",
    url: `${base}/sign-up`,
    footer:
      "You asked for this report on the Client Status website health report page. We won’t email you again unless you ticked the box for product updates.",
  });
  await sendEmail({
    to: email,
    subject: `Sample website health report: ${host}`,
    text,
    html: body,
    idempotencyKey: `tool-report/${runId}`,
    attachments: [{ filename: `website-health-${host}.pdf`, content: pdf }],
  });
}

/** The registrable domain of an already-validated hostname (the tools only accept those). */
function registrable(hostname: string): string {
  return getDomain(hostname, { allowPrivateDomains: false }) ?? hostname;
}
