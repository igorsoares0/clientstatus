import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { StatusGlyph } from "@/components/ui/status";
import { db } from "@/lib/db";
import { getClient } from "@/lib/data/clients";
import { UserFacingError } from "@/lib/data/errors";
import { formatMonthYear, formatShortDate } from "@/lib/format";
import { requireMembership } from "@/lib/session";
import { getPlan } from "@/lib/plans";
import { siteStatusView, sslCell } from "@/lib/site-status";
import { ClientHeaderActions } from "./client-header-actions";
import { ClientNotes } from "./client-notes";
import { ClientRecipients } from "./client-recipients";
import { ClientReports } from "./client-reports";
import { listRecipients } from "@/lib/data/reports";

export const metadata: Metadata = { title: "Client" };

export default function ClientDetailPage({ params }: PageProps<"/clients/[id]">) {
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
      <ClientDetail params={params} />
    </Suspense>
  );
}

async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  let client;
  try {
    client = await getClient(db, ctx, id);
  } catch (error) {
    if (error instanceof UserFacingError && error.code === "not_found") notFound();
    throw error;
  }
  const canManage = ctx.role !== "member";
  const archived = client.status === "archived";
  const now = new Date();
  const activeSites = client.sites.filter((s) => s.status === "active").length;
  const [recipients, reports] = await Promise.all([
    listRecipients(db, ctx, client.id),
    db.monthlyReport.findMany({
      where: { workspaceId: ctx.workspaceId, clientId: client.id },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: { id: true, periodLabel: true, kind: true, status: true, sentAt: true, disclosures: true },
    }),
  ]);
  const intervalMs = getPlan(ctx.workspace.planKey).uptimeIntervalSeconds * 1000;

  return (
    <>
      <header className="flex flex-col gap-2.5 border-b border-border bg-surface px-7 pt-3.5 pb-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[12.5px] text-muted">
          <Link href="/clients" className="text-muted">
            Clients
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink">
            {client.name}
          </span>
        </nav>
        <ClientHeaderActions
          client={{
            id: client.id,
            name: client.name,
            contactName: client.contactName ?? "",
            contactEmail: client.contactEmail ?? "",
          }}
          archived={archived}
          canManage={canManage}
          siteCount={client.sites.length}
          activeSites={activeSites}
          subtitle={
            <span className="text-[13px] text-muted">
              {client.contactName ? `${client.contactName} · ` : ""}
              {client.contactEmail ? (
                <>
                  <a href={`mailto:${client.contactEmail}`} className="font-mono text-[12.5px] text-ink-2">
                    {client.contactEmail}
                  </a>
                  {" · "}
                </>
              ) : null}
              client since {formatMonthYear(client.createdAt, tz)}
            </span>
          }
        />
        {archived && client.archivedAt ? (
          <div role="status" className="border border-border bg-canvas px-3 py-2 text-[13px] text-ink-2">
            Archived {formatShortDate(client.archivedAt, tz, now)}. Monitoring history and reports are kept and still
            readable. No new reports are generated.
          </div>
        ) : null}
      </header>

      <div className="flex flex-1 flex-wrap items-start gap-6 px-7 pt-5 pb-8">
        <main className="flex max-w-[860px] min-w-0 flex-[1_1_520px] flex-col gap-6">
          <section aria-labelledby="h-sites" className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 id="h-sites" className="m-0 text-[17px] font-semibold font-stretch-85%">
                Websites <span className="font-mono text-[13px] font-normal text-muted">{client.sites.length}</span>
              </h2>
              {!archived ? (
                <Link href={`/websites?add=${client.id}`} className="ml-auto text-[13px]">
                  Add a website for this client
                </Link>
              ) : null}
            </div>
            <div className="border border-border bg-surface">
              {client.sites.length === 0 ? (
                <p className="m-0 px-4 py-3.5 text-[13.5px] text-muted">
                  No websites yet. Add one here, or assign an existing website from its settings.
                </p>
              ) : (
                <table className="w-full border-collapse text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                      <th scope="col" className="px-4 py-2 font-normal">
                        WEBSITE
                      </th>
                      <th scope="col" className="px-4 py-2 font-normal">
                        STATUS
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">
                        SSL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.sites.map((s) => {
                      const view = siteStatusView(
                        { ...s, archivedAt: null, pausedBy: null },
                        s.state,
                        intervalMs,
                        tz,
                        now,
                      );
                      const ssl = sslCell(s.state, s.baseUrl.startsWith("https://"), now);
                      return (
                        <tr key={s.id} className="border-b border-rule last:border-0">
                          <td className="px-4 py-2">
                            <span className="flex flex-col">
                              <Link href={`/websites/${s.id}`} className="font-semibold">
                                {s.name}
                              </Link>
                              <span className="font-mono text-xs text-muted">{s.normalizedHostname}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="flex flex-col">
                              <StatusGlyph status={view.status} label={view.label} />
                              <span className="text-xs text-muted">{view.sub}</span>
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2 text-right ${ssl.tone === "down" ? "text-down" : ssl.tone === "degraded" ? "text-degraded" : ssl.tone === "muted" ? "text-muted" : ""} ${ssl.strong ? "font-semibold" : ""}`}
                            title={ssl.title}
                          >
                            {ssl.text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section aria-labelledby="h-rep" className="flex flex-col gap-2.5">
            <h2 id="h-rep" className="m-0 text-[17px] font-semibold font-stretch-85%">
              Monthly reports
            </h2>
            <ClientReports
              clientId={client.id}
              canManage={canManage && !archived}
              reports={reports.map((r) => ({
                id: r.id,
                label: r.periodLabel,
                kind: r.kind,
                status: r.status,
                sentAt: r.sentAt ? formatShortDate(r.sentAt, tz, now) : null,
                gaps: r.disclosures.length,
              }))}
            />
          </section>
        </main>

        <aside className="flex max-w-[420px] min-w-0 flex-[1_1_300px] flex-col gap-5">
          <section aria-labelledby="h-rec" className="flex flex-col gap-2 border border-border bg-surface p-4">
            <h2 id="h-rec" className="m-0 text-[15px] font-semibold">
              Report recipients
            </h2>
            <ClientRecipients
              clientId={client.id}
              canManage={canManage && !archived}
              recipients={recipients.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                confirmed: Boolean(r.confirmedAt),
                bounced: Boolean(r.lastBouncedAt),
              }))}
            />
            <p className="m-0 text-xs text-muted">
              Recipients are confirmed once, before the first delivery. Clients never receive alerts — only the monthly
              report.
            </p>
          </section>
          <section aria-labelledby="h-notes" className="flex flex-col gap-2 border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="h-notes" className="m-0 text-[15px] font-semibold">
                Internal notes
              </h2>
              <span className="text-xs text-muted">Team only — never in client reports</span>
            </div>
            <ClientNotes clientId={client.id} initial={client.notes ?? ""} canEdit={canManage} />
          </section>
        </aside>
      </div>
    </>
  );
}
