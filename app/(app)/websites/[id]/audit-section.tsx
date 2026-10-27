import { SeverityMeter } from "@/components/ui/status";
import { db } from "@/lib/db";
import { auditQueued, latestAudit, manualAuditAllowance, openFindings } from "@/lib/data/audits";
import type { TenantContext } from "@/lib/data/tenant";
import { formatClock, formatShortDate } from "@/lib/format";
import { RunAuditButton } from "./run-audit-button";

// Website Detail → Audit findings (design screen 3). Findings say "first found
// <date>"; coverage limits are spelled out; basic checks only (FR-SEO-07).

const STATUS = {
  queued: { label: "Queued", cls: "border-border-strong text-muted" },
  running: { label: "Running", cls: "border-border-strong text-ink" },
  completed: { label: "Complete", cls: "border-up text-up" },
  partial: { label: "Partial", cls: "border-warn-border text-degraded" },
  failed: { label: "Failed", cls: "border-down-border text-down" },
  cancelled: { label: "Cancelled", cls: "border-border-strong text-muted" },
} as const;

const SHOWN = 50;

function shortUrl(url: string | null, siteHost: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return host === siteHost ? `${u.pathname}${u.search}` || "/" : `${u.host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export async function AuditSection({
  ctx,
  siteId,
  siteHost,
  siteActive,
  nextAuditAt,
  tz,
  now,
}: {
  ctx: TenantContext;
  siteId: string;
  siteHost: string;
  siteActive: boolean;
  nextAuditAt: Date | null;
  tz: string;
  now: Date;
}) {
  const [run, findings, allowance, queuedJob] = await Promise.all([
    latestAudit(db, ctx, siteId),
    openFindings(db, ctx, siteId, SHOWN),
    manualAuditAllowance(db, ctx, now),
    auditQueued(db, ctx, siteId),
  ]);
  const when = (d: Date) => `${formatShortDate(d, tz, now)} ${formatClock(d, tz, false)}`;
  const busy = run?.status === "queued" || run?.status === "running" || queuedJob !== null;
  // A scheduled audit waiting in the queue has no run row yet.
  const waiting = queuedJob !== null && run?.status !== "queued" && run?.status !== "running";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 border border-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {waiting ? (
            <>
              <span className={`border px-2 py-px text-xs font-semibold ${STATUS.queued.cls}`}>Queued</span>
              <span className="text-[13px] text-ink-2">
                {run ? "Next audit is queued" : "First audit is queued"} — it starts as soon as a crawler slot is free.
              </span>
            </>
          ) : run ? (
            <>
              <span className={`border px-2 py-px text-xs font-semibold ${STATUS[run.status].cls}`}>
                {STATUS[run.status].label}
              </span>
              <span className="text-[13px] text-ink-2 tabular">
                {run.status === "queued"
                  ? `Queued ${when(run.createdAt)}`
                  : run.status === "running"
                    ? `Started ${when(run.startedAt ?? run.createdAt)}`
                    : `${when(run.completedAt ?? run.createdAt)} · ${run.pagesVisited.toLocaleString("en-GB")} of ${run.pagesBudget.toLocaleString("en-GB")}-page budget · ${run.linksChecked.toLocaleString("en-GB")} links checked`}
                {run.trigger === "manual" ? " · manual" : ""}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-muted">
              No audit yet.{siteActive && nextAuditAt ? ` The first audit is scheduled for ${when(nextAuditAt)}.` : ""}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted tabular">
              {allowance.left} of {allowance.allowed} manual audit{allowance.allowed === 1 ? "" : "s"} left this week
            </span>
            <RunAuditButton siteId={siteId} disabled={!siteActive || busy || allowance.left === 0} busy={busy} />
          </span>
        </div>
        {run && (run.status === "completed" || run.status === "partial") ? (
          <p className="m-0 text-xs text-muted tabular">
            {run.robots === "ignored"
              ? "robots.txt ignored (site setting)"
              : run.robots === "missing"
                ? "No robots.txt — all pages allowed"
                : `robots.txt respected${run.skippedByRobots ? ` · ${run.skippedByRobots} page${run.skippedByRobots === 1 ? "" : "s"} skipped` : ""}`}
            {run.inconclusiveLinks
              ? ` · ${run.inconclusiveLinks} link${run.inconclusiveLinks === 1 ? "" : "s"} inconclusive (rate-limited, blocked or timed out — not counted)`
              : ""}
            {siteActive && nextAuditAt && nextAuditAt > now ? ` · next scheduled audit ${when(nextAuditAt)}` : ""}
          </p>
        ) : null}
        {run?.status === "partial" && run.partialReasons.length ? (
          <div role="note" className="border border-warn-border bg-warn-tint px-3 py-2 text-[13px] text-warn-text">
            <b className="font-semibold text-warn-strong">▲ Coverage incomplete.</b> {run.partialReasons.join(" · ")}.
            Findings from pages not reached this time stay open until a complete audit re-checks them.
          </div>
        ) : null}
        {run?.status === "failed" ? (
          <div role="note" className="border border-down-border bg-down-tint px-3 py-2 text-[13px] text-down">
            The audit couldn’t finish{run.errorSummary ? ` (${run.errorSummary.slice(0, 160)})` : ""}. Earlier findings
            are kept.
          </div>
        ) : null}
      </div>

      {findings.total === 0 ? (
        run && (run.status === "completed" || run.status === "partial") ? (
          <p className="m-0 border border-border bg-surface px-4 py-3.5 text-[13.5px] text-muted">
            <span aria-hidden="true" className="text-up">
              ●
            </span>{" "}
            No open findings{run.status === "partial" ? " on the pages this audit reached" : ""}.
          </p>
        ) : null
      ) : (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                <th scope="col" className="w-[110px] px-4 py-2 font-normal">
                  SEVERITY
                </th>
                <th scope="col" className="px-2 py-2 font-normal">
                  FINDING
                </th>
                <th scope="col" className="w-[100px] px-2 py-2 font-normal">
                  FIRST FOUND
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  PAGE → TARGET
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.items.map((f) => (
                <tr key={f.id} className="border-b border-rule align-baseline last:border-0">
                  <td className="px-4 py-2">
                    <SeverityMeter severity={f.severity} />
                  </td>
                  <td className="px-2 py-2">{f.summary}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted">{formatShortDate(f.firstSeenAt, tz, now)}</td>
                  <td className="max-w-[360px] px-4 py-2 font-mono text-xs break-all text-ink-2">
                    {f.sourceUrl ? (
                      <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-2">
                        {shortUrl(f.sourceUrl, siteHost)}
                      </a>
                    ) : null}
                    {f.sourceUrl && f.targetUrl ? <span className="text-muted"> → </span> : null}
                    {f.targetUrl ? (
                      <a href={f.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-2">
                        {shortUrl(f.targetUrl, siteHost)}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {findings.total > SHOWN ? (
            <p className="m-0 border-t border-rule px-4 py-2 text-xs text-muted">
              Showing the {SHOWN} most important of {findings.total.toLocaleString("en-GB")} open findings.
            </p>
          ) : null}
        </div>
      )}
      <p className="m-0 text-xs leading-normal text-muted">
        Basic technical checks — broken links, redirects, titles, descriptions, canonicals, headings, robots.txt and
        sitemap. Not a complete SEO audit, and no ranking promises. Pages that need JavaScript to render may be only
        partly covered.
      </p>
    </div>
  );
}
