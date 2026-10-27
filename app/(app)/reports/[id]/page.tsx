import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { brandSummary, DEFAULT_BRAND } from "@/lib/color";
import { db } from "@/lib/db";
import { UserFacingError } from "@/lib/data/errors";
import { getReport, listRecipients } from "@/lib/data/reports";
import { formatClock, formatShortDate } from "@/lib/format";
import { getNotificationSettings } from "@/lib/notify/settings";
import type { StoredReport } from "@/lib/reports/generate";
import { REPORT_STATUS } from "@/lib/reports/status";
import { requireMembership } from "@/lib/session";
import { ReviewPanel } from "./review-panel";
import { SentPanel } from "./sent-panel";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense
      fallback={
        <PageBody>
          <div className="pt-[18px]">
            <PanelSkeleton />
          </div>
        </PageBody>
      }
    >
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const now = new Date();
  let report;
  try {
    report = await getReport(db, ctx, id);
  } catch (error) {
    if (error instanceof UserFacingError && error.code === "not_found") notFound();
    throw error;
  }
  const [recipients, settings] = await Promise.all([
    listRecipients(db, ctx, report.clientId),
    getNotificationSettings(db, ctx.workspaceId),
  ]);
  const data = report.data as unknown as StoredReport | null;
  const status = REPORT_STATUS[report.status];
  const canManage = ctx.role !== "member";
  const brand = brandSummary(data?.branding.color ?? DEFAULT_BRAND);

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-border bg-surface px-7 pt-3.5 pb-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[12.5px] text-muted">
          <Link href="/reports" className="text-muted">
            Reports
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink">
            {report.client.name} · {report.periodLabel}
          </span>
        </nav>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="m-0 text-[26px] leading-[1.1] font-semibold font-stretch-84%">{report.client.name}</h1>
          <span className="text-[13px] text-muted">
            {report.periodLabel} {report.kind === "preview" ? "preview" : "report"} · {report.code}
            {report.generatedAt
              ? ` · generated ${formatShortDate(report.generatedAt, tz, now)} ${formatClock(report.generatedAt, tz, false)}`
              : ""}
          </span>
          <span className={`text-[13px] ${status.cls}`}>
            <span aria-hidden="true">{status.glyph}</span> {status.label}
          </span>
          {report.storageKey ? (
            <a href={`/api/reports/${report.id}/pdf?download=1`} className="ml-auto text-[13px]">
              Download PDF
            </a>
          ) : null}
        </div>
      </header>

      {report.status === "generating" ? (
        <PageBody>
          <p className="mt-5 max-w-[640px] border border-border bg-surface px-4 py-3.5 text-[13.5px] text-muted">
            This report is being generated. It usually takes under a minute — refresh to see it.
          </p>
        </PageBody>
      ) : report.status === "failed" ? (
        <PageBody>
          <div className="mt-5 flex max-w-[640px] flex-col gap-2 border border-down-border bg-down-tint px-4 py-3.5 text-[13.5px]">
            <span className="font-semibold text-down">The report couldn’t be generated.</span>
            {report.errorSummary ? <span className="text-ink-2">{report.errorSummary.slice(0, 240)}</span> : null}
            {canManage ? <RetryButton reportId={report.id} /> : null}
          </div>
        </PageBody>
      ) : report.status === "no_data" ? (
        <PageBody>
          <div className="mt-5 flex max-w-[680px] flex-col gap-2 border border-border bg-surface px-4 py-3.5 text-[13.5px]">
            <span className="font-semibold">No report for {report.periodLabel}</span>
            <span className="text-ink-2">
              None of this client’s websites had any checks in this period, so there’s nothing to report — we don’t send
              empty or estimated figures.
            </span>
            {report.disclosures.length ? (
              <ul className="m-0 pl-5 text-muted">
                {report.disclosures.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </PageBody>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-6 px-7 pt-5 pb-8">
          <div className="min-w-0 flex-[1_1_560px]">
            <iframe
              title="Report preview"
              src={`/api/reports/${report.id}/html`}
              className="h-[80vh] w-full border border-border bg-[#EEF0EE]"
              sandbox=""
            />
          </div>
          <aside
            aria-label={report.status === "sent" ? "Delivery" : "Review"}
            className="sticky top-5 flex w-full max-w-[420px] min-w-0 flex-[1_1_340px] flex-col gap-4"
          >
            {report.status === "needs_review" ? (
              canManage ? (
                <ReviewPanel
                  reportId={report.id}
                  clientId={report.clientId}
                  kind={report.kind === "preview" ? "preview" : "monthly"}
                  disclosures={report.disclosures}
                  recipients={recipients.map((r) => ({
                    id: r.id,
                    name: r.name,
                    email: r.email,
                    confirmed: Boolean(r.confirmedAt),
                    bounced: Boolean(r.lastBouncedAt),
                  }))}
                  linkDays={settings.linkExpiryDays}
                  brand={{
                    name: data?.branding.agencyName ?? "",
                    color: brand.cover,
                    textColor: brand.coverText,
                    ratio: brand.ratio,
                    hasLogo: Boolean(data?.branding.logoDataUri),
                  }}
                />
              ) : (
                <p className="m-0 border border-border bg-surface px-4 py-3.5 text-[13.5px] text-muted">
                  An admin reviews and sends reports.
                </p>
              )
            ) : (
              <SentPanel
                reportId={report.id}
                canManage={canManage}
                linkDays={settings.linkExpiryDays}
                link={{
                  exists: Boolean(report.privateTokenHash),
                  revoked: Boolean(report.linkRevokedAt),
                  expiresAt: report.linkExpiresAt ? `${formatShortDate(report.linkExpiresAt, tz, now)}` : null,
                  expired: Boolean(report.linkExpiresAt && report.linkExpiresAt <= now),
                }}
                deliveries={report.deliveries.map((d) => {
                  const e = d.emailDeliveryId ? report.emailStatus.get(d.emailDeliveryId) : undefined;
                  return {
                    email: d.email,
                    status: e?.status ?? "pending",
                    at: e?.sentAt ? `${formatShortDate(e.sentAt, tz, now)} ${formatClock(e.sentAt, tz, false)}` : null,
                  };
                })}
                disclosures={report.disclosures}
                recipients={recipients.map((r) => ({ id: r.id, email: r.email, confirmed: Boolean(r.confirmedAt) }))}
              />
            )}
          </aside>
        </div>
      )}
    </>
  );
}
