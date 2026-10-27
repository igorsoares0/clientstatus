import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyPanel, PageBody, PageHeader, PanelSkeleton } from "@/components/shell/page";
import { QuickAddForm } from "@/components/sites/quick-add-form";
import { ButtonLink } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { SeverityMeter } from "@/components/ui/status";
import { db } from "@/lib/db";
import { incidentCode } from "@/lib/data/incidents";
import { portfolio, recentIncidentEvents } from "@/lib/data/overview";
import { recentSiteActivity, siteCounts } from "@/lib/data/sites";
import { formatClock, formatLongDate, formatShortDate, plural } from "@/lib/format";
import { getPlan } from "@/lib/plans";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <ButtonLink href="/websites?add=1" size="sm">
            <PlusIcon />
            Add website
          </ButtonLink>
        }
      />
      <PageBody>
        <Suspense fallback={<PanelSkeleton />}>
          <Overview />
        </Suspense>
      </PageBody>
    </>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  "site.created": "Website added",
  "site.updated": "Settings changed",
  "site.paused": "Monitoring paused",
  "site.resumed": "Monitoring resumed",
  "site.archived": "Website archived",
  "site.restored": "Website restored",
  "client.created": "Client added",
  "client.updated": "Client details changed",
  "client.notes_updated": "Client notes changed",
  "client.archived": "Client archived",
  "client.restored": "Client restored",
  "sites.imported": "Websites imported",
};

async function Overview() {
  const ctx = await requireMembership();
  const plan = getPlan(ctx.workspace.planKey);
  const tz = ctx.workspace.timezone;
  const intervalMs = plan.uptimeIntervalSeconds * 1000;
  const now = new Date();
  const counts = await siteCounts(db, ctx);
  const minutes = plan.uptimeIntervalSeconds / 60;

  if (counts.active + counts.paused === 0) {
    return (
      <EmptyPanel
        title="Add your first client website"
        intro={
          <>
            We’ll check it every {minutes === 1 ? "minute" : `${minutes} minutes`} on your {plan.name} plan and track
            its SSL certificate and domain expiry. The first result usually arrives within one check interval.
          </>
        }
        footer={
          <>
            <span>
              Managing many sites? <Link href="/websites">Import a CSV</Link> with validation preview before anything is
              added.
            </span>
            {ctx.role !== "member" ? (
              <span>
                Prefer to organise first? <Link href="/clients">Create a client</Link>
              </span>
            ) : null}
          </>
        }
      >
        <QuickAddForm />
      </EmptyPanel>
    );
  }

  const [p, auditActivity, incidentEvents] = await Promise.all([
    portfolio(db, ctx, intervalMs, now),
    recentSiteActivity(db, ctx, 8),
    recentIncidentEvents(db, ctx, 8),
  ]);
  const total = p.total;
  const healthy = p.dist.up;
  const segments = [
    { key: "down", label: "Down", glyph: "◆", n: p.dist.down, bar: "bg-down", glyphCls: "text-down" },
    {
      key: "degraded",
      label: "Degraded",
      glyph: "▲",
      n: p.dist.degraded,
      bar: "bg-degraded",
      glyphCls: "text-degraded",
    },
    {
      key: "unknown",
      label: "Unknown / stale",
      glyph: "○",
      n: p.dist.unknown,
      bar: "bg-[repeating-linear-gradient(45deg,#8D9396_0_2px,#E2E4E1_2px_4px)]",
      glyphCls: "text-muted",
    },
    { key: "up", label: "Up", glyph: "●", n: p.dist.up, bar: "bg-up", glyphCls: "text-up" },
    { key: "paused", label: "Paused", glyph: "‖", n: p.dist.paused, bar: "bg-faint", glyphCls: "text-muted" },
  ];

  const activity = [
    ...auditActivity.map((a) => ({
      id: a.id,
      at: a.createdAt,
      label: ACTIVITY_LABEL[a.action] ?? a.action,
      href:
        a.action === "sites.imported"
          ? "/websites"
          : a.resourceType === "site"
            ? `/websites/${a.resourceId}`
            : `/clients/${a.resourceId}`,
      target: a.label,
      by: a.actor?.name ?? null,
      mono: a.resourceType === "site",
    })),
    ...incidentEvents.map((e) => ({
      id: e.id,
      at: e.createdAt,
      label:
        e.eventType === "opened"
          ? `${incidentCode(e.incident.number)} opened`
          : `${incidentCode(e.incident.number)} resolved`,
      href: `/incidents?i=${e.incident.id}`,
      target: e.incident.site.normalizedHostname,
      by: null,
      mono: true,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex max-w-[880px] min-w-0 flex-[1_1_560px] flex-col gap-5">
        <section aria-labelledby="h-portfolio" className="flex flex-col gap-3">
          <h2 id="h-portfolio" className="m-0 text-[28px] leading-[1.15] font-semibold font-stretch-85%">
            {p.atRisk
              ? `${p.atRisk} of ${total} websites at risk.`
              : p.awaiting === total - p.dist.paused
                ? `${plural(p.awaiting, "website")} awaiting first check.`
                : `Nothing at risk across ${plural(total, "website")}.`}{" "}
            <span className="font-normal text-muted">
              {[
                `${healthy} healthy`,
                p.awaiting ? `${p.awaiting} awaiting first check` : "",
                p.dist.paused ? `${p.dist.paused} paused` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </h2>
          <div aria-hidden="true" className="flex h-3 w-full">
            {segments
              .filter((s) => s.n > 0)
              .map((s) => (
                <span key={s.key} className={s.bar} style={{ width: `${(s.n / total) * 100}%` }} />
              ))}
          </div>
          <ul aria-label="Status distribution" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {segments.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 border border-border-strong bg-surface px-2.5 py-1 text-[13px]"
              >
                <span aria-hidden="true" className={s.glyphCls}>
                  {s.glyph}
                </span>
                {s.label} <b className="tabular">{s.n}</b>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            <div className="flex flex-col">
              <span className="text-muted">Active incidents</span>
              <span className="tabular">
                <b className="text-xl font-semibold">{p.activeIncidents}</b>{" "}
                {p.unacknowledged ? (
                  <Link href="/incidents?state=open" className="text-[12.5px] text-down">
                    {p.unacknowledged} not acknowledged
                  </Link>
                ) : null}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted">Expiring ≤ 30 days</span>
              <span className="tabular">
                <b className="text-xl font-semibold">{p.expiring30}</b>{" "}
                {p.expiring7 ? (
                  <span className="text-[12.5px] text-degraded">▲ {p.expiring7} within 7 days</span>
                ) : null}
              </span>
            </div>
          </div>
        </section>

        <section aria-labelledby="h-attention" className="border border-border bg-surface">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-rule px-4 py-3">
            <h2 id="h-attention" className="m-0 text-[15px] font-semibold">
              Needs attention <span className="font-mono font-normal text-muted">{p.items.length}</span>
            </h2>
            <span className="text-[13px] text-muted">Most severe first, then oldest</span>
            <Link href="/incidents" className="ml-auto text-[13px]">
              All incidents
            </Link>
          </div>
          {p.items.length === 0 ? (
            <p className="m-0 px-4 py-3.5 text-[13.5px] leading-normal text-muted">
              {p.awaiting === total - p.dist.paused
                ? "Nothing to rank yet. Websites appear here when a check finds something — down, SSL problems, degraded or stale results."
                : "Nothing needs attention. Every checked website passed its latest checks."}
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {p.items.map((i) => (
                <li
                  key={i.key}
                  className={`grid grid-cols-[110px_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 last:border-0 ${i.rank === 0 ? "bg-down-tint" : ""}`}
                >
                  <span className="text-[13px]">
                    <SeverityMeter severity={i.severity} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={i.incidentId ? `/incidents?i=${i.incidentId}` : `/websites/${i.siteId}`}
                      className="font-semibold"
                    >
                      {i.title}
                    </Link>
                    <span className="truncate text-xs text-muted">
                      <span className="font-mono">{i.hostname}</span>
                      {i.client ? ` · ${i.client}` : ""}
                    </span>
                  </span>
                  <span className="text-right font-mono text-xs whitespace-nowrap text-muted">
                    {i.since ? `since ${formatClock(i.since, tz, false)}` : i.dueAt ? formatLongDate(i.dueAt, tz) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-rule px-4 py-2.5 text-[13px] text-muted">
            {plural(p.quiet, "other website")} passed every check in the last 24 h
            {p.awaiting ? ` · ${p.awaiting} awaiting first check` : ""}
            {p.dist.paused ? ` · ${p.dist.paused} paused` : ""} · <Link href="/websites">View in Websites</Link>
          </div>
        </section>
      </div>

      <aside className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-5">
        <section aria-labelledby="h-activity" className="border border-border bg-surface">
          <h2 id="h-activity" className="m-0 border-b border-rule px-4 py-3 text-[15px] font-semibold">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <p className="m-0 px-4 py-3 text-[13px] text-muted">No activity yet.</p>
          ) : (
            <ol className="m-0 list-none p-0">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-rule-soft px-4 py-2 text-[13px] last:border-0">
                  <span className="w-[72px] shrink-0 font-mono text-xs text-muted">
                    {formatShortDate(a.at, tz, now)}
                    <br />
                    {formatClock(a.at, tz, false)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span>{a.label}</span>
                    <span className="truncate text-muted">
                      <Link href={a.href} className={`text-muted ${a.mono ? "font-mono text-xs" : ""}`}>
                        {a.target}
                      </Link>
                      {a.by ? ` · ${a.by}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="h-reports" className="border border-border bg-surface">
          <h2 id="h-reports" className="m-0 border-b border-rule px-4 py-3 text-[15px] font-semibold">
            Latest reports
          </h2>
          <p className="m-0 px-4 py-3 text-[13px] text-muted">No reports yet.</p>
        </section>
      </aside>
    </div>
  );
}
