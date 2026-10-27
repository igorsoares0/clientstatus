import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { listReports, reportPeriods } from "@/lib/data/reports";
import { formatClock, formatShortDate } from "@/lib/format";
import { first, hrefWith, type Params } from "@/lib/search-params";
import { REPORT_STATUS } from "@/lib/reports/status";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense
      fallback={
        <>
          <header className="px-7 pt-[18px] pb-3.5">
            <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Reports</h1>
          </header>
          <PageBody>
            <PanelSkeleton />
          </PageBody>
        </>
      }
    >
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const periods = await reportPeriods(db, ctx);
  const selected = first(params.period);
  const period = periods.find((p) => p.periodStart.toISOString() === selected) ?? null;
  const reports = await listReports(db, ctx, period ? { periodStart: period.periodStart } : {});

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Reports</h1>
        <span className="text-[13px] text-muted">
          Monthly reports generate on the 1st at 06:00 ({tz}) for the month before ·{" "}
          <Link href="/settings?tab=schedule">Schedule &amp; branding</Link>
        </span>
      </header>
      <PageBody>
        {reports.length === 0 && !period ? (
          <section className="flex max-w-[760px] flex-col border border-border bg-surface">
            <div className="flex flex-col gap-2 border-b border-rule px-6 pt-6 pb-[18px]">
              <h2 className="m-0 text-[22px] font-semibold font-stretch-85%">No reports yet</h2>
              <p className="m-0 leading-normal text-ink-2">
                Reports are generated on the 1st of each month for the month before, and held for your review before
                anything is sent. You can also generate a preview of the current month from any client’s page.
              </p>
            </div>
            <dl className="m-0 grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 px-6 py-[18px] text-[13.5px]">
              <dt className="font-semibold">Partial first month</dt>
              <dd className="m-0">
                Websites added mid-month get a report covering only the monitored days, labelled as such. No figures are
                back-filled.
              </dd>
              <dt className="font-semibold">Before first send</dt>
              <dd className="m-0">You confirm each client’s recipients once. After that, delivery can be automatic.</dd>
            </dl>
          </section>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div
              role="group"
              aria-label="Period"
              className="flex flex-wrap self-start border border-border-strong bg-surface"
            >
              <Link
                href={hrefWith("/reports", params, { period: null })}
                aria-current={!period ? "true" : undefined}
                className={`flex h-8 items-center px-3 text-[13px] no-underline ${!period ? "bg-ink text-white hover:text-white" : "text-ink"}`}
              >
                All
              </Link>
              {periods.map((p) => {
                const on = period?.periodStart.getTime() === p.periodStart.getTime();
                return (
                  <Link
                    key={p.periodStart.toISOString()}
                    href={hrefWith("/reports", params, { period: p.periodStart.toISOString() })}
                    aria-current={on ? "true" : undefined}
                    className={`flex h-8 items-center px-3 text-[13px] no-underline ${on ? "bg-ink text-white hover:text-white" : "text-ink"}`}
                  >
                    {p.periodLabel}
                  </Link>
                );
              })}
            </div>
            <section aria-label="Report history" className="overflow-x-auto border border-border bg-surface">
              <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                    <th scope="col" className="px-4 py-2 font-normal">
                      CLIENT
                    </th>
                    <th scope="col" className="px-2 py-2 font-normal">
                      PERIOD
                    </th>
                    <th scope="col" className="px-2 py-2 font-normal">
                      STATUS
                    </th>
                    <th scope="col" className="px-2 py-2 font-normal">
                      DATA NOTES
                    </th>
                    <th scope="col" className="px-2 py-2 font-normal">
                      DELIVERY
                    </th>
                    <th scope="col" className="px-2 py-2 font-normal">
                      PRIVATE LINK
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const s = REPORT_STATUS[r.status];
                    const link = !r.privateTokenHash
                      ? "—"
                      : r.linkRevokedAt
                        ? "Revoked"
                        : r.linkExpiresAt && r.linkExpiresAt <= now
                          ? "Expired"
                          : `Active until ${formatShortDate(r.linkExpiresAt!, tz, now)}`;
                    return (
                      <tr key={r.id} className="border-b border-rule align-top last:border-0 hover:bg-row-hover">
                        <td className="px-4 py-2.5">
                          <Link href={`/clients/${r.client.id}`} className="font-semibold">
                            {r.client.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5">
                          {r.periodLabel}
                          {r.kind === "preview" ? (
                            <span className="ml-1.5 border border-border-strong px-1.5 text-xs text-muted">
                              Preview
                            </span>
                          ) : null}
                        </td>
                        <td className={`px-2 py-2.5 ${s.cls}`}>
                          <span aria-hidden="true">{s.glyph}</span> {s.label}
                        </td>
                        <td className="max-w-[280px] px-2 py-2.5 text-[13px] text-muted">
                          {r.status === "generating"
                            ? "—"
                            : r.disclosures.length
                              ? `${r.disclosures.length} gap${r.disclosures.length === 1 ? "" : "s"} disclosed`
                              : "Complete data"}
                        </td>
                        <td className="px-2 py-2.5 text-[13px]">
                          {r.sentAt ? (
                            <>
                              {r.deliveries.length} recipient{r.deliveries.length === 1 ? "" : "s"}
                              <span className="block font-mono text-xs text-muted">
                                {formatShortDate(r.sentAt, tz, now)} {formatClock(r.sentAt, tz, false)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted">Not sent</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-muted">{link}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Link href={`/reports/${r.id}`} className="font-semibold">
                            {r.status === "needs_review" ? "Review" : "Open"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {reports.length === 0 ? (
                <p className="m-0 px-4 py-6 text-[13px] text-muted">No reports for this period.</p>
              ) : null}
            </section>
          </div>
        )}
      </PageBody>
    </>
  );
}
