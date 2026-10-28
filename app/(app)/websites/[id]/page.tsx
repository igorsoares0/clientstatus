import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { SeverityMeter, StatusGlyph } from "@/components/ui/status";
import { db } from "@/lib/db";
import { listClientOptions } from "@/lib/data/clients";
import { UserFacingError } from "@/lib/data/errors";
import { siteIncidents } from "@/lib/data/incidents";
import { medianResponse, PERIODS, recentChecks, siteUptime, uptimeBuckets, type Period } from "@/lib/data/monitoring";
import { getSite, siteCounts } from "@/lib/data/sites";
import { formatClock, formatLongDate, formatShortDate } from "@/lib/format";
import { formatPercent } from "@/lib/monitoring/uptime";
import { env } from "@/lib/env";
import { getPlan, moreSitesHint } from "@/lib/plans";
import { first, hrefWith, type Params } from "@/lib/search-params";
import { requireMembership } from "@/lib/session";
import { domainCell, siteStatusView, sslCell } from "@/lib/site-status";
import { AuditSection } from "./audit-section";
import { OnThisPage } from "./on-this-page";
import { RunCheckButton } from "./run-check-button";
import { SiteActions } from "./site-actions";
import { SiteSettingsForm } from "./site-settings-form";

export const metadata: Metadata = { title: "Website" };

export default function WebsiteDetailPage({ params, searchParams }: PageProps<"/websites/[id]">) {
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
      <WebsiteDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "uptime", label: "Uptime history" },
  { id: "ssl", label: "SSL & domain" },
  { id: "audit", label: "Audit findings" },
  { id: "incidents", label: "Incidents" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const STATE_LABEL = { open: "Open", acknowledged: "Acknowledged", muted: "Muted", resolved: "Resolved" } as const;
const CHECK_GLYPH = {
  success: ["●", "text-up"],
  failure: ["◆", "text-down"],
  inconclusive: ["◌", "text-muted"],
} as const;

async function WebsiteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const plan = getPlan(ctx.workspace.planKey);
  const intervalMs = plan.uptimeIntervalSeconds * 1000;
  const period: Period = (Object.keys(PERIODS) as Period[]).includes(first(sp.period) as Period)
    ? (first(sp.period) as Period)
    : "24h";

  let site;
  try {
    site = await getSite(db, ctx, id);
  } catch (error) {
    if (error instanceof UserFacingError && error.code === "not_found") notFound();
    throw error;
  }
  const now = new Date();
  const [clients, counts, uptime30, uptimePeriod, strip, median, checks, incidents] = await Promise.all([
    listClientOptions(db, ctx),
    siteCounts(db, ctx),
    siteUptime(db, ctx, site, "30d", intervalMs, now),
    siteUptime(db, ctx, site, period, intervalMs, now),
    uptimeBuckets(db, ctx, site.id, period, now),
    medianResponse(db, ctx, site.id, now),
    recentChecks(db, ctx, site.id, 8),
    siteIncidents(db, ctx, site.id),
  ]);
  const state = site.state;
  const view = siteStatusView(site, state, intervalMs, tz, now);
  const https = site.baseUrl.startsWith("https://");
  const ssl = sslCell(state, https, now);
  const domain = domainCell(state, now);
  const intervalMin = plan.uptimeIntervalSeconds / 60;
  const interval = intervalMin === 1 ? "minute" : `${intervalMin} minutes`;
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const clientOptions =
    site.client && !clients.some((c) => c.id === site.client!.id)
      ? [...clients, { id: site.client.id, name: `${site.client.name} (archived)` }]
      : clients;

  const freshness =
    site.status !== "active"
      ? state?.lastCheckAt
        ? `Last check ${formatShortDate(state.lastCheckAt, tz, now)} ${formatClock(state.lastCheckAt, tz, false)}`
        : "No checks"
      : state?.lastCheckAt
        ? `Checked ${formatClock(state.lastCheckAt, tz)}${state.nextCheckAt > now ? ` · next check ${formatClock(state.nextCheckAt, tz)}` : " · next check due"}`
        : "First check queued";
  const tint =
    view.status === "down"
      ? "border-down-border bg-down-tint"
      : view.status === "degraded" || view.stale
        ? "border-warn-border bg-warn-tint"
        : "border-rule bg-canvas";
  const statusText =
    site.status === "paused"
      ? `Monitoring paused ${view.sub}. No checks run and no alerts are sent.`
      : site.status === "archived"
        ? `Archived ${view.sub}. No checks run.`
        : view.stale
          ? `No new results for over two check intervals — showing the last known value. ${state?.statusDetail ?? ""}`
          : !state?.lastCheckAt
            ? "No check results yet. Status, uptime and SSL appear after the first check."
            : (state.statusDetail ?? (view.status === "up" ? "Responding normally." : view.sub));

  const facts = [
    {
      k: "STATUS",
      v: view.label,
      s: view.sub || "—",
      tone: view.status === "down" ? "text-down" : view.status === "degraded" ? "text-degraded" : "",
    },
    {
      k: "UPTIME 30 D",
      v: formatPercent(uptime30.percent),
      s: uptime30.conclusive ? `${uptime30.conclusive.toLocaleString("en-GB")} conclusive checks` : "No checks yet",
      tone: uptime30.percent !== null && uptime30.percent < 99 ? "text-degraded" : "",
    },
    {
      k: "RESPONSE",
      v: median !== null ? `${median.toLocaleString("en-GB")} ms` : "—",
      s: median !== null ? "median of successful checks, 24 h" : "No successful checks in 24 h",
      tone: "",
    },
    {
      k: "SSL CERTIFICATE",
      v: ssl.text,
      s: ssl.title,
      tone: ssl.tone === "down" ? "text-down" : ssl.tone === "degraded" ? "text-degraded" : "",
    },
    {
      k: "DOMAIN",
      v: domain.text === "n/a" ? "n/a" : domain.text,
      s: domain.title,
      tone: domain.tone === "down" ? "text-down" : domain.tone === "degraded" ? "text-degraded" : "",
    },
    {
      k: "LAST AUDIT",
      v: state?.lastAuditAt ? formatShortDate(state.lastAuditAt, tz, now) : "—",
      s: state?.lastAuditAt
        ? `${state.lastAuditStatus === "partial" ? "Partial · " : state.lastAuditStatus === "failed" ? "Failed · " : ""}${state.openFindings} open finding${state.openFindings === 1 ? "" : "s"}`
        : "No audit yet",
      tone:
        state?.lastAuditStatus === "failed" ? "text-down" : state?.lastAuditStatus === "partial" ? "text-degraded" : "",
    },
    {
      k: "OPEN INCIDENTS",
      v: String(openIncidents.length),
      s: openIncidents.length ? openIncidents[0].title : "None",
      tone: openIncidents.length ? "text-down" : "",
    },
  ];

  return (
    <>
      <header className="flex flex-col gap-2.5 border-b border-border bg-surface px-7 pt-3.5 pb-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[12.5px] text-muted">
          <Link href="/websites" className="text-muted">
            Websites
          </Link>
          <span aria-hidden="true">/</span>
          {site.client ? (
            <>
              <Link href={`/clients/${site.client.id}`} className="text-muted">
                {site.client.name}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span aria-current="page" className="text-ink">
            {site.normalizedHostname}
          </span>
        </nav>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-[26px] leading-[1.1] font-semibold font-stretch-84%">{site.name}</h1>
            <span className="text-[13px] text-muted">
              <a
                href={site.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[13px] break-all text-ink-2"
              >
                {site.baseUrl}
              </a>
              {" · "}
              {site.client ? (
                <>
                  Client:{" "}
                  <Link href={`/clients/${site.client.id}`} className="text-ink-2">
                    {site.client.name}
                  </Link>
                </>
              ) : (
                "Unassigned"
              )}
              {" · "}Checked every {interval}
            </span>
          </div>
          <div className="ml-auto">
            <RunCheckButton siteId={site.id} disabled={site.status !== "active"} />
          </div>
        </div>
        <SiteActions
          siteId={site.id}
          hostname={site.normalizedHostname}
          state={site.status}
          slotsFree={plan.maxActiveSites - counts.active}
          maxSites={plan.maxActiveSites}
          planName={plan.name}
          moreSites={moreSitesHint(plan, env().SUPPORT_EMAIL)}
          status={
            <div role="status" className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 border px-3.5 py-2.5 ${tint}`}>
              <span className="text-[17px] font-semibold">
                <StatusGlyph status={view.status} label={view.label} />
              </span>
              <span className="text-ink-2">{statusText}</span>
              <span className="ml-auto font-mono text-xs text-muted">{freshness}</span>
            </div>
          }
        />
      </header>

      <div className="flex min-w-0 flex-1 items-start gap-7 px-7 pt-5 pb-8">
        <OnThisPage sections={SECTIONS} />
        <main className="flex max-w-[980px] min-w-0 flex-1 flex-col gap-8">
          <Section id="summary" title="Summary">
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border border-border bg-surface">
              {facts.map((f) => (
                <div key={f.k} className="flex min-w-0 flex-col gap-0.5 border-r border-b border-rule px-3.5 py-3">
                  <dt className="text-xs tracking-[.03em] text-muted">{f.k}</dt>
                  <dd className={`m-0 truncate text-lg font-semibold font-stretch-88% tabular ${f.tone}`}>{f.v}</dd>
                  <dd className="m-0 line-clamp-2 text-[12.5px] text-muted">{f.s}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            id="uptime"
            title="Uptime history"
            aside={
              <div role="group" aria-label="Period" className="flex border border-border-strong bg-surface">
                {(Object.keys(PERIODS) as Period[]).map((p) => (
                  <Link
                    key={p}
                    href={hrefWith(`/websites/${site.id}`, sp, { period: p === "24h" ? null : p }) + "#uptime"}
                    scroll={false}
                    aria-current={p === period ? "true" : undefined}
                    className={`flex h-8 items-center px-2.5 font-mono text-[12.5px] no-underline ${p === period ? "bg-ink text-white hover:text-white" : "text-ink"}`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            }
          >
            <div className="flex flex-col gap-3 border border-border bg-surface px-4 py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="text-[22px] font-semibold font-stretch-88% tabular">
                  {formatPercent(uptimePeriod.percent)}
                </span>
                <span className="text-[13px] text-muted tabular">
                  {uptimePeriod.conclusive.toLocaleString("en-GB")} conclusive of{" "}
                  {uptimePeriod.completed.toLocaleString("en-GB")} completed checks
                  {uptimePeriod.coverage !== null ? ` · coverage ${Math.round(uptimePeriod.coverage * 100)}%` : ""}
                </span>
              </div>
              <div aria-hidden="true" className="flex h-7 gap-px">
                {strip.buckets.map((b) => (
                  <span
                    key={b.start.getTime()}
                    title={`${formatShortDate(b.start, tz, now)} ${formatClock(b.start, tz, false)} — ${b.success} passed, ${b.failure} failed, ${b.inconclusive} inconclusive`}
                    className={`flex-1 ${
                      b.failure
                        ? "bg-down"
                        : b.success
                          ? "bg-up"
                          : b.inconclusive
                            ? "bg-[repeating-linear-gradient(45deg,#8D9396_0_2px,#E2E4E1_2px_4px)]"
                            : "bg-no-data"
                    }`}
                  />
                ))}
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
                <li>
                  <span aria-hidden="true" className="text-up">
                    ■
                  </span>{" "}
                  Passed
                </li>
                <li>
                  <span aria-hidden="true" className="text-down">
                    ■
                  </span>{" "}
                  Failed check
                </li>
                <li>
                  <span aria-hidden="true" className="text-faint">
                    ▨
                  </span>{" "}
                  Inconclusive only
                </li>
                <li>
                  <span aria-hidden="true" className="text-no-data">
                    ■
                  </span>{" "}
                  No data
                </li>
              </ul>
              {checks.length ? (
                <ol aria-label="Latest checks" className="m-0 list-none border-t border-rule p-0 pt-2">
                  {checks.map((c) => {
                    const [g, cls] = CHECK_GLYPH[c.status];
                    return (
                      <li key={c.id} className="flex gap-3 py-1 text-[13px]">
                        <span className="w-[120px] shrink-0 font-mono text-xs text-muted">
                          {formatShortDate(c.checkedAt, tz, now)} {formatClock(c.checkedAt, tz)}
                        </span>
                        <span className="w-14 shrink-0 font-mono text-xs text-muted uppercase">{c.checkType}</span>
                        <span className="min-w-0">
                          <span aria-hidden="true" className={cls}>
                            {g}
                          </span>{" "}
                          {c.summary}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>
          </Section>

          <Section id="ssl" title="SSL & domain">
            <dl className="m-0 grid grid-cols-[170px_1fr] gap-x-4 gap-y-2 border border-border bg-surface px-4 py-3.5 text-[13.5px]">
              <dt className="text-muted">SSL certificate</dt>
              <dd className="m-0">
                {https ? (state?.sslDetail ?? "Not checked yet") : "None — this site is checked over http only"}
              </dd>
              {state?.sslExpiresAt ? (
                <>
                  <dt className="text-muted">Expires</dt>
                  <dd className="m-0">
                    {formatLongDate(state.sslExpiresAt, tz)} {formatClock(state.sslExpiresAt, tz, false)}
                    {state.sslIssuer ? ` · issued by ${state.sslIssuer}` : ""}
                  </dd>
                </>
              ) : null}
              {https ? (
                <>
                  <dt className="text-muted">Checked</dt>
                  <dd className="m-0 font-mono text-[12.5px]">
                    {state?.sslCheckedAt
                      ? `${formatShortDate(state.sslCheckedAt, tz, now)} ${formatClock(state.sslCheckedAt, tz, false)}`
                      : "—"}
                    {site.status === "active" && state
                      ? ` · next ${formatShortDate(state.nextSslCheckAt, tz, now)} ${formatClock(state.nextSslCheckAt, tz, false)}`
                      : ""}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">Registrable domain</dt>
              <dd className="m-0 font-mono text-[12.5px]">{site.registrableDomain ?? "—"}</dd>
              <dt className="text-muted">Domain expiry</dt>
              <dd className="m-0">
                {state?.domainDetail ?? "Not checked yet. Shown only when the registry publishes it — never estimated."}
                {state?.domainSource ? <span className="text-muted"> · source: {state.domainSource}</span> : null}
              </dd>
              <dt className="text-muted">Domain checked</dt>
              <dd className="m-0 font-mono text-[12.5px]">
                {state?.domainCheckedAt
                  ? `${formatShortDate(state.domainCheckedAt, tz, now)} ${formatClock(state.domainCheckedAt, tz, false)}`
                  : "—"}
              </dd>
            </dl>
          </Section>

          <Section id="audit" title="Audit findings">
            <AuditSection
              ctx={ctx}
              siteId={site.id}
              siteHost={site.normalizedHostname}
              siteActive={site.status === "active"}
              nextAuditAt={state?.nextAuditAt ?? null}
              tz={tz}
              now={now}
            />
          </Section>

          <Section id="incidents" title="Incidents">
            {incidents.length === 0 ? (
              <EmptyBox>
                No incidents. Incidents open only for confirmed problems — 2 consecutive failed checks.
              </EmptyBox>
            ) : (
              <ul className="m-0 list-none border border-border bg-surface p-0">
                {incidents.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 last:border-0"
                  >
                    <span className="w-[110px] shrink-0 text-[13px]">
                      <SeverityMeter severity={i.severity} settled={i.status !== "open"} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/incidents?i=${i.id}`} className="font-semibold">
                        {i.title}
                      </Link>
                      <span className="font-mono text-xs text-muted">
                        INC-{String(i.number).padStart(4, "0")} · {formatShortDate(i.firstDetectedAt, tz, now)}{" "}
                        {formatClock(i.firstDetectedAt, tz, false)}
                        {i.resolvedAt
                          ? ` → ${formatShortDate(i.resolvedAt, tz, now)} ${formatClock(i.resolvedAt, tz, false)}`
                          : ""}
                      </span>
                    </span>
                    <span className={`text-[13px] ${i.status === "resolved" ? "text-muted" : "font-semibold"}`}>
                      {STATE_LABEL[i.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="reports" title="Reports">
            <EmptyBox>No reports yet. Monthly reports cover only the days this website was monitored.</EmptyBox>
          </Section>

          <Section id="settings" title="Settings">
            <SiteSettingsForm
              siteId={site.id}
              initial={{
                name: site.name,
                clientId: site.client?.id ?? "",
                timeoutMs: site.timeoutMs,
                downPolicy: site.downPolicy,
                respectRobots: (site.crawlConfig as { respectRobots?: boolean } | null)?.respectRobots !== false,
                alertsEnabled: site.alertsEnabled,
              }}
              clients={clientOptions}
              intervalText={`Every ${interval} — set by the ${plan.name} plan`}
              disabled={site.status === "archived"}
            />
          </Section>
        </main>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-5 flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`h-${id}`} className="m-0 text-[17px] font-semibold font-stretch-85%">
          {title}
        </h2>
        {aside ? <div className="ml-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 border border-border bg-surface px-4 py-3.5 text-[13.5px] leading-normal text-muted">
      {children}
    </p>
  );
}
