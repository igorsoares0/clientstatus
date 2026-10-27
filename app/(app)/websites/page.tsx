import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { listClientOptions } from "@/lib/data/clients";
import { listSites, PAGE_SIZES, SITE_SORTS, siteCounts, type SiteSort, type SiteStatusFilter } from "@/lib/data/sites";
import { openIncidentCounts, uptimeBySite } from "@/lib/data/monitoring";
import { formatClock, formatShortDate } from "@/lib/format";
import { computeUptime, formatPercent } from "@/lib/monitoring/uptime";
import { getPlan } from "@/lib/plans";
import { first, hrefWith, type Params } from "@/lib/search-params";
import { requireMembership } from "@/lib/session";
import { domainCell, siteStatusView, sslCell } from "@/lib/site-status";
import { HeaderActions } from "./header-actions";
import { WebsitesTable, type SiteRow, type SortHeader } from "./websites-table";
import { WebsitesToolbar } from "./websites-toolbar";

export const metadata: Metadata = { title: "Websites" };

export default function WebsitesPage({ searchParams }: PageProps<"/websites">) {
  return (
    <Suspense
      fallback={
        <>
          <header className="px-7 pt-[18px] pb-3.5">
            <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Websites</h1>
          </header>
          <PageBody>
            <PanelSkeleton />
          </PageBody>
        </>
      }
    >
      <Websites searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_FILTERS: SiteStatusFilter[] = ["all", "active", "paused", "archived"];

async function Websites({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireMembership();
  const plan = getPlan(ctx.workspace.planKey);
  const tz = ctx.workspace.timezone;

  const sortParam = first(params.sort);
  const sort: SiteSort = SITE_SORTS.includes(sortParam as SiteSort) ? (sortParam as SiteSort) : "status";
  const dir = first(params.dir) === "desc" ? "desc" : "asc";
  const statusParam = first(params.status) as SiteStatusFilter | undefined;
  const status = statusParam && STATUS_FILTERS.includes(statusParam) ? statusParam : "all";
  const clientParam = first(params.client);
  const q = first(params.q) ?? "";
  const size = Number(first(params.size)) || 25;

  const [list, counts, clients] = await Promise.all([
    listSites(db, ctx, {
      q,
      clientId: clientParam || undefined,
      status,
      sort,
      dir,
      page: Number(first(params.page)) || 1,
      pageSize: size,
    }),
    siteCounts(db, ctx),
    listClientOptions(db, ctx),
  ]);
  const free = plan.maxActiveSites - counts.active;
  const now = new Date();
  const intervalMs = plan.uptimeIntervalSeconds * 1000;
  const ids = list.items.map((s) => s.id);
  const [uptime, incidents] = await Promise.all([
    uptimeBySite(db, ctx, ids, "30d", now),
    openIncidentCounts(db, ctx, ids),
  ]);

  const rows: SiteRow[] = list.items.map((s) => {
    const view = siteStatusView(s, s.state, intervalMs, tz, now);
    const up = computeUptime(uptime.get(s.id) ?? { success: 0, failure: 0, inconclusive: 0 }, null);
    const https = s.baseUrl.startsWith("https://");
    const last = s.state?.lastCheckAt ?? null;
    return {
      id: s.id,
      name: s.name,
      hostname: s.normalizedHostname,
      https,
      client: s.client ? { id: s.client.id, name: s.client.name } : null,
      state: s.status,
      view,
      uptime: {
        text: formatPercent(up.percent),
        title: up.conclusive
          ? `${up.conclusive.toLocaleString("en-GB")} conclusive checks in 30 days`
          : "No conclusive checks yet",
        low: up.percent !== null && up.percent < 99,
      },
      response: s.state?.lastResponseMs ? `${s.state.lastResponseMs.toLocaleString("en-GB")} ms` : "—",
      ssl: sslCell(s.state, https, now),
      domain: domainCell(s.state, now),
      incidents: incidents.get(s.id) ?? 0,
      audit: s.state?.lastAuditAt
        ? {
            text: formatShortDate(s.state.lastAuditAt, tz, now),
            sub:
              s.state.lastAuditStatus === "failed"
                ? "Failed"
                : s.state.lastAuditStatus === "partial"
                  ? "Partial"
                  : s.state.lastAuditStatus === "running"
                    ? "Running"
                    : s.state.openFindings
                      ? `${s.state.openFindings} finding${s.state.openFindings === 1 ? "" : "s"}`
                      : "No findings",
            warn: s.state.lastAuditStatus === "failed" || s.state.lastAuditStatus === "partial",
          }
        : null,
      lastCheck: last
        ? {
            text: formatClock(last, tz, false),
            title: `Last check ${formatShortDate(last, tz, now)} ${formatClock(last, tz)}${view.stale ? " — stale (older than 2 intervals)" : ""}`,
            stale: view.stale,
          }
        : {
            text: "—",
            title: s.status === "active" ? "No checks yet — first check queued" : "No checks",
            stale: false,
          },
    };
  });

  const header = (key: SiteSort, label: string): SortHeader => {
    const on = sort === key;
    return {
      key,
      label,
      href: hrefWith("/websites", params, { sort: key, dir: on && dir === "asc" ? "desc" : null, page: null }),
      ariaSort: on ? (dir === "asc" ? "ascending" : "descending") : "none",
      arrow: on ? (dir === "asc" ? "↑" : "↓") : "",
    };
  };
  const sortHeaders = {
    name: header("name", "WEBSITE"),
    client: header("client", "CLIENT"),
    status: header("status", "STATUS"),
    added: header("added", "ADDED"),
  };

  const filtersOn = Boolean(q || clientParam || status !== "all");
  const emptyWorkspace = counts.active + counts.paused + counts.archived === 0;
  const rangeStart = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const rangeEnd = Math.min(list.page * list.pageSize, list.total);

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Websites</h1>
        <span className="text-[13px] text-muted tabular">
          {counts.active} monitored · {counts.paused} paused · {Math.max(free, 0)} of {plan.maxActiveSites} plan slots
          free
        </span>
        <span className="flex-1" />
        <HeaderActions clients={clients} slotsFree={free} maxSites={plan.maxActiveSites} />
      </header>

      <PageBody>
        {emptyWorkspace ? (
          <section className="flex max-w-[760px] flex-col border border-border bg-surface">
            <div className="flex flex-col gap-2 border-b border-rule px-6 pt-6 pb-[18px]">
              <h2 className="m-0 text-2xl font-semibold font-stretch-85%">No websites yet</h2>
              <p className="m-0 max-w-[600px] leading-normal text-pretty text-ink-2">
                Add one website to start, or import your whole client list from a CSV. We’ll validate every row and show
                problems before anything is added.
              </p>
            </div>
            <div className="flex flex-wrap">
              <div className="flex flex-[1_1_280px] flex-col gap-2.5 px-6 py-5">
                <span className="font-semibold">One website</span>
                <span className="text-[13px] leading-[1.45] text-muted">
                  Address, display name and client. Checks start once monitoring is running.
                </span>
              </div>
              <div className="flex flex-[1_1_280px] flex-col gap-2.5 px-6 py-5">
                <span className="font-semibold">Many websites</span>
                <span className="text-[13px] leading-[1.45] text-muted">
                  CSV with <span className="font-mono text-xs">url</span>,{" "}
                  <span className="font-mono text-xs">name</span>, <span className="font-mono text-xs">client</span>{" "}
                  columns. Up to your plan’s {plan.maxActiveSites} sites.
                </span>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex min-w-0 flex-col">
            <WebsitesToolbar q={q} client={clientParam ?? ""} status={status} clients={clients} filtersOn={filtersOn} />
            <WebsitesTable
              rows={rows}
              sortHeaders={sortHeaders}
              matchText={
                list.total === 0
                  ? "No websites match these filters"
                  : `Showing ${rangeStart}–${rangeEnd} of ${list.total} website${list.total === 1 ? "" : "s"}`
              }
              slotsFree={free}
              maxSites={plan.maxActiveSites}
              planName={plan.name}
              clearFiltersHref={filtersOn ? "/websites" : null}
            />
            {list.total > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-t-0 border-border bg-surface px-3 py-2 text-[13px]">
                <span className="text-muted tabular">
                  {rangeStart}–{rangeEnd} of {list.total}
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  Rows
                  {PAGE_SIZES.map((n) => (
                    <Link
                      key={n}
                      href={hrefWith("/websites", params, { size: n === 25 ? null : n, page: null })}
                      aria-current={list.pageSize === n ? "true" : undefined}
                      className={`px-1.5 tabular ${list.pageSize === n ? "font-semibold text-ink no-underline" : "text-muted"}`}
                    >
                      {n}
                    </Link>
                  ))}
                </span>
                {list.pageCount > 1 ? (
                  <nav aria-label="Pagination" className="ml-auto flex gap-0.5">
                    <PagerLink
                      href={list.page > 1 ? hrefWith("/websites", params, { page: list.page - 1 }) : null}
                      label="Previous page"
                    >
                      ←
                    </PagerLink>
                    {Array.from({ length: list.pageCount }, (_, i) => i + 1).map((p) => (
                      <Link
                        key={p}
                        href={hrefWith("/websites", params, { page: p === 1 ? null : p })}
                        aria-current={p === list.page ? "page" : undefined}
                        aria-label={`Page ${p}`}
                        className={`flex h-[30px] min-w-8 items-center justify-center border px-2 no-underline tabular ${
                          p === list.page ? "border-ink bg-ink text-white hover:text-white" : "border-border bg-surface"
                        }`}
                      >
                        {p}
                      </Link>
                    ))}
                    <PagerLink
                      href={list.page < list.pageCount ? hrefWith("/websites", params, { page: list.page + 1 }) : null}
                      label="Next page"
                    >
                      →
                    </PagerLink>
                  </nav>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2.5 mb-0 text-xs leading-normal text-muted">
              Uptime is check-based: successful checks ÷ completed checks in the period. Inconclusive checks are
              excluded and missing checks are never counted as up. A result older than two check intervals is shown as
              stale.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function PagerLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = "flex h-[30px] items-center border border-border bg-surface px-2.5 no-underline";
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  ) : (
    <span aria-hidden="true" className={`${cls} opacity-40`}>
      {children}
    </span>
  );
}
