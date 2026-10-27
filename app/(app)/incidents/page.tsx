import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { SeverityMeter } from "@/components/ui/status";
import { db } from "@/lib/db";
import { UserFacingError } from "@/lib/data/errors";
import {
  getIncident,
  incidentChecks,
  incidentCode,
  incidentStateCounts,
  listIncidents,
  type IncidentListItem,
} from "@/lib/data/incidents";
import { formatClock, formatShortDate } from "@/lib/format";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/generated/prisma/enums";
import { CONFIRM_RECOVERIES } from "@/lib/monitoring/decide";
import { first, hrefWith, type Params } from "@/lib/search-params";
import { requireMembership } from "@/lib/session";
import { IncidentActions } from "./incident-actions";
import { IncidentFilters } from "./incident-filters";
import { IncidentNoteForm } from "./incident-note-form";

export const metadata: Metadata = { title: "Incidents" };

export default function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
  return (
    <Suspense
      fallback={
        <>
          <header className="px-7 pt-[18px] pb-3.5">
            <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Incidents</h1>
          </header>
          <PageBody>
            <PanelSkeleton />
          </PageBody>
        </>
      }
    >
      <Incidents searchParams={searchParams} />
    </Suspense>
  );
}

const SEV_ORDER: Record<IncidentSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATES: IncidentStatus[] = ["open", "acknowledged", "muted", "resolved"];
const TYPE_LABEL: Record<IncidentType, string> = {
  downtime: "Downtime",
  ssl_invalid: "SSL invalid",
  ssl_expiry: "SSL expiry",
  domain_expiry: "Domain expiry",
  audit_issue: "Audit",
};
const GROUPS: { status: IncidentStatus; title: string }[] = [
  { status: "open", title: "Needs acknowledgment" },
  { status: "acknowledged", title: "Acknowledged — follow up" },
  { status: "muted", title: "Muted" },
  { status: "resolved", title: "Resolved · last 30 days" },
];

function duration(from: Date, to: Date) {
  const min = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

async function Incidents({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const stateParam = first(params.state) as IncidentStatus | undefined;
  const state = stateParam && STATES.includes(stateParam) ? stateParam : "all";
  const severity = first(params.severity) as IncidentSeverity | undefined;
  const type = first(params.type) as IncidentType | undefined;
  const filters = {
    state,
    severity: severity && severity in SEV_ORDER ? severity : undefined,
    type: type && type in TYPE_LABEL ? type : undefined,
    siteId: first(params.site),
    q: first(params.q),
  } as const;
  const selectedId = first(params.i);

  const [items, counts] = await Promise.all([listIncidents(db, ctx, filters, now), incidentStateCounts(db, ctx, now)]);
  const total = counts.open + counts.acknowledged + counts.muted + counts.resolved;

  let selected = null;
  if (selectedId) {
    try {
      selected = await getIncident(db, ctx, selectedId);
    } catch (error) {
      if (error instanceof UserFacingError && error.code === "not_found") notFound();
      throw error;
    }
  }

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: items
      .filter((i) => i.status === g.status)
      .sort(
        (a, b) =>
          (g.status === "open" ? SEV_ORDER[a.severity] - SEV_ORDER[b.severity] : 0) ||
          b.firstDetectedAt.getTime() - a.firstDetectedAt.getTime(),
      ),
  })).filter((g) => g.items.length > 0);

  const row = (i: IncidentListItem) => {
    const isSel = i.id === selectedId;
    const settled = i.status !== "open";
    const ongoing = i.status !== "resolved";
    return (
      <li key={i.id}>
        <Link
          href={hrefWith("/incidents", params, { i: i.id, ev: null })}
          scroll={false}
          aria-current={isSel ? "true" : undefined}
          className={`grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-rule px-4 py-2.5 text-ink no-underline hover:bg-row-hover hover:text-ink ${
            isSel ? "bg-row-selected shadow-[inset_3px_0_0_var(--color-ink)]" : ""
          }`}
        >
          <span className="pt-px text-[13px]">
            <SeverityMeter severity={i.severity} settled={settled} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`truncate ${settled ? "" : "font-semibold"}`}>{i.title}</span>
            <span className="truncate text-xs text-muted">
              <span className="font-mono">{i.site.normalizedHostname}</span>
              {i.site.client ? ` · ${i.site.client.name}` : ""} · {TYPE_LABEL[i.type]}
            </span>
            <span className="font-mono text-xs text-muted">
              {incidentCode(i.number)} ·{" "}
              {ongoing
                ? `${duration(i.firstDetectedAt, now)} · ongoing`
                : `${duration(i.firstDetectedAt, i.resolvedAt ?? now)} · resolved ${formatShortDate(i.resolvedAt ?? now, tz, now)}`}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Incidents</h1>
        <span className="text-[13px] text-muted tabular">
          {counts.open} need acknowledgment · {counts.acknowledged} acknowledged · {counts.muted} muted ·{" "}
          {counts.resolved} resolved in 30 days
        </span>
      </header>
      <PageBody>
        {total === 0 ? (
          <section className="flex max-w-[760px] flex-col border border-border bg-surface">
            <div className="flex flex-col gap-2 border-b border-rule px-6 pt-6 pb-[18px]">
              <h2 className="m-0 text-[22px] font-semibold font-stretch-85%">No incidents in the last 30 days</h2>
              <p className="m-0 leading-normal text-ink-2">
                Incidents open only for confirmed problems, so a single slow or failed check won’t appear here.
              </p>
            </div>
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 px-6 py-[18px] text-[13.5px]">
              <dt className="font-semibold">Downtime</dt>
              <dd className="m-0">2 consecutive failed checks. Resolves after 2 consecutive passes.</dd>
              <dt className="font-semibold">SSL</dt>
              <dd className="m-0">
                Invalid, mismatched or untrusted certificates, and expiry at 30, 14, 7 and 1 days.
              </dd>
              <dt className="font-semibold">Domain</dt>
              <dd className="m-0">Registration expiry within 30 days, when the registry publishes it.</dd>
            </dl>
          </section>
        ) : (
          <div className="flex items-start gap-5">
            <div
              className={`min-w-0 flex-1 flex-col gap-3 split:flex split:max-w-[560px] ${selected ? "hidden" : "flex"}`}
            >
              <IncidentFilters counts={counts} />
              <section aria-label="Incident list" className="border border-border bg-surface">
                {grouped.length === 0 ? (
                  <div className="flex flex-col gap-2 px-4 py-7">
                    <span className="font-semibold">No incidents match these filters</span>
                    <span className="text-[13px] text-muted">
                      Resolved incidents from the last 30 days are included under Resolved.
                    </span>
                    <Link href="/incidents" className="self-start text-[13px]">
                      Clear filters
                    </Link>
                  </div>
                ) : (
                  grouped.map((g) => (
                    <section key={g.status} aria-labelledby={`g-${g.status}`}>
                      <h2
                        id={`g-${g.status}`}
                        className="m-0 border-b border-rule bg-canvas px-4 py-1.5 text-xs font-semibold tracking-[.03em] text-muted uppercase"
                      >
                        {g.title} <span className="font-mono font-normal">{g.items.length}</span>
                      </h2>
                      <ul className="m-0 list-none p-0">{g.items.map(row)}</ul>
                    </section>
                  ))
                )}
              </section>
            </div>

            {selected ? (
              <IncidentDetail incident={selected} tz={tz} now={now} params={params} />
            ) : (
              <div className="sticky top-5 hidden min-w-0 flex-1 border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted split:block">
                Select an incident to see its timeline, diagnosis and actions.
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

const ALERT_KIND: Record<string, string> = {
  incident_opened: "Alert",
  incident_threshold: "Threshold alert",
  incident_reminder: "Reminder",
  incident_resolved: "Recovery email",
};

const EVENT_LABEL: Record<string, string> = {
  opened: "Opened",
  resolved: "Resolved",
  acknowledged: "Acknowledged",
  unacknowledged: "Acknowledgment undone",
  muted: "Muted",
  unmuted: "Unmuted",
  severity_changed: "Severity changed",
  note: "Note",
};

async function IncidentDetail({
  incident,
  tz,
  now,
  params,
}: {
  incident: Awaited<ReturnType<typeof getIncident>>;
  tz: string;
  now: Date;
  params: Params;
}) {
  const ctx = await requireMembership();
  const [{ checks, counts }, alerts] = await Promise.all([
    incidentChecks(db, ctx, incident, now),
    db.emailDelivery.findMany({
      where: { workspaceId: ctx.workspaceId, incidentId: incident.id },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { templateType: true, status: true, createdAt: true, recipient: true },
    }),
  ]);
  const ev = first(params.ev);
  const filter = ev === "changes" || ev === "checks" ? ev : "all";
  const when = (d: Date) => `${formatShortDate(d, tz, now)} ${formatClock(d, tz)}`;
  const state = incident.site.state;
  const siteActive = incident.site.status === "active";

  const recovery = (() => {
    if (incident.status === "resolved")
      return {
        title: "Recovered",
        text: incident.events.find((e) => e.eventType === "resolved")?.detail ?? "Resolved automatically.",
      };
    if (!siteActive)
      return {
        title: "Not updating",
        text: "Monitoring for this website is paused, so this incident won’t change until it resumes.",
      };
    switch (incident.type) {
      case "downtime":
        return {
          title: "Not recovered",
          text: `${state?.consecutiveSuccesses ?? 0} of ${CONFIRM_RECOVERIES} recovery checks passed.${state ? ` Next check ${formatClock(state.nextCheckAt, tz)}.` : ""}`,
        };
      case "ssl_invalid":
        return {
          title: "Not recovered",
          text: `Resolves when a valid certificate for this hostname is detected.${state ? ` Next SSL check ${formatClock(state.nextSslCheckAt, tz, false)}.` : ""}`,
        };
      case "ssl_expiry":
        return {
          title: "Waiting for renewal",
          text: `Resolves when a renewed certificate is detected.${state ? ` Next SSL check ${formatClock(state.nextSslCheckAt, tz, false)}.` : ""}`,
        };
      case "domain_expiry":
        return { title: "Waiting for renewal", text: "Resolves when RDAP shows a later expiry date. Checked daily." };
      case "audit_issue":
        return {
          title: "Waiting for next audit",
          text: `Resolves when the next complete audit no longer finds these links.${state?.nextAuditAt ? ` Next scheduled audit ${formatShortDate(state.nextAuditAt, tz, now)} ${formatClock(state.nextAuditAt, tz, false)}.` : ""}`,
        };
    }
  })();

  type Entry = {
    id: string;
    at: Date;
    kind: "change" | "note" | "check";
    label: string;
    text: string;
    tone: string;
    glyph?: string;
  };
  const entries: Entry[] = [
    ...incident.events.map((e) => ({
      id: e.id,
      at: e.createdAt,
      kind: e.eventType === "note" ? ("note" as const) : ("change" as const),
      label: EVENT_LABEL[e.eventType] ?? e.eventType,
      text:
        e.eventType === "note"
          ? `${e.note ?? ""}${e.actor ? ` — ${e.actor.name}` : ""}`
          : [e.detail, e.actor ? `by ${e.actor.name}` : ""].filter(Boolean).join(" · "),
      tone: "",
    })),
    ...checks.map((c) => ({
      id: c.id,
      at: c.checkedAt,
      kind: "check" as const,
      label: "",
      text: c.summary,
      glyph: c.status === "failure" ? "◆" : c.status === "success" ? "●" : "◌",
      tone: c.status === "failure" ? "text-down" : c.status === "success" ? "text-up" : "text-muted",
    })),
  ]
    .filter((e) => filter === "all" || (filter === "checks" ? e.kind === "check" : e.kind !== "check"))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const stateChip = {
    open: { label: "Open", cls: "border-down-border text-down" },
    acknowledged: { label: "Acknowledged", cls: "border-border-strong text-ink" },
    muted: { label: "Muted", cls: "border-border-strong text-muted" },
    resolved: { label: "Resolved", cls: "border-up text-up" },
  }[incident.status];
  const lastChange = incident.events.find((e) =>
    ["acknowledged", "muted", "unmuted", "resolved"].includes(e.eventType),
  );

  return (
    <article
      aria-labelledby="incident-title"
      className="sticky top-5 flex max-w-[640px] min-w-0 flex-1 flex-col border border-border bg-surface"
    >
      <div className="flex flex-col gap-2 border-b border-rule px-5 pt-4 pb-3.5">
        <Link
          href={hrefWith("/incidents", params, { i: null, ev: null })}
          className="self-start text-[13px] split:hidden"
        >
          ← All incidents
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="font-mono text-xs text-muted">
            {incidentCode(incident.number)} · {TYPE_LABEL[incident.type]}
          </span>
          <SeverityMeter severity={incident.severity} settled={incident.status !== "open"} />
          <span className={`border px-2 py-px text-xs font-semibold ${stateChip.cls}`}>
            {stateChip.label}
            {lastChange?.actor ? ` · ${lastChange.actor.name}` : ""}
            {lastChange && incident.status !== "open"
              ? ` · ${formatShortDate(lastChange.createdAt, tz, now)} ${formatClock(lastChange.createdAt, tz, false)}`
              : ""}
          </span>
        </div>
        <h2 id="incident-title" className="m-0 text-[22px] font-semibold font-stretch-86%">
          {incident.title}
        </h2>
        <span className="text-[13px] text-muted">
          <Link href={`/websites/${incident.site.id}`} className="font-mono text-[12.5px] text-ink-2">
            {incident.site.normalizedHostname}
          </Link>
          {incident.site.client ? ` · ${incident.site.client.name}` : ""}
        </span>
        <IncidentActions
          incidentId={incident.id}
          status={incident.status}
          siteId={incident.site.id}
          code={incidentCode(incident.number)}
        />
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">First detected</dt>
          <dd className="m-0 font-mono text-xs">{when(incident.firstDetectedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Last detected</dt>
          <dd className="m-0 font-mono text-xs">{when(incident.lastDetectedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Duration</dt>
          <dd className="m-0 font-mono text-xs">
            {duration(incident.firstDetectedAt, incident.resolvedAt ?? now)}
            {incident.resolvedAt ? "" : " · ongoing"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Resolved</dt>
          <dd className="m-0 font-mono text-xs">{incident.resolvedAt ? when(incident.resolvedAt) : "—"}</dd>
        </div>
      </dl>

      <section aria-labelledby="h-recovery" className="flex flex-col gap-1 border-b border-rule px-5 py-3.5">
        <h3 id="h-recovery" className="m-0 text-[13px] font-semibold">
          Recovery · <span className={incident.status === "resolved" ? "text-up" : ""}>{recovery.title}</span>
        </h3>
        <p className="m-0 text-[13px] text-ink-2">{recovery.text}</p>
      </section>

      <section aria-labelledby="h-diag" className="flex flex-col gap-1.5 border-b border-rule px-5 py-3.5">
        <h3 id="h-diag" className="m-0 text-[13px] font-semibold">
          Latest diagnostic
        </h3>
        <p className="m-0 text-[13px] text-ink-2">{incident.summary}</p>
        <p className="m-0 flex flex-wrap gap-x-4 text-xs text-muted tabular">
          <span>
            <span aria-hidden="true" className="text-down">
              ◆
            </span>{" "}
            {counts.failure} failed
          </span>
          <span>
            <span aria-hidden="true">◌</span> {counts.inconclusive} inconclusive (not counted)
          </span>
          <span>
            <span aria-hidden="true" className="text-up">
              ●
            </span>{" "}
            {counts.success} passed
          </span>
        </p>
      </section>

      <section aria-labelledby="h-alerts" className="flex flex-col gap-1 border-b border-rule px-5 py-3.5">
        <h3 id="h-alerts" className="m-0 text-[13px] font-semibold">
          Alerts sent
        </h3>
        <p className="m-0 text-[13px] text-ink-2">
          {incident.type === "audit_issue"
            ? "No email — audit issues are listed here and in the client report only."
            : alerts.length === 0
              ? "No alert emails for this incident — check who gets alerts in Settings, or whether alerts are off for this website."
              : alerts
                  .map(
                    (a) =>
                      `${ALERT_KIND[a.templateType] ?? "Email"} ${a.status === "sent" ? "sent" : a.status === "pending" ? "queued" : a.status} ${formatShortDate(a.createdAt, tz, now)} ${formatClock(a.createdAt, tz, false)} to ${a.recipient}`,
                  )
                  .join(" · ")}
        </p>
      </section>

      <section aria-labelledby="h-note" className="flex flex-col gap-1.5 border-b border-rule px-5 py-3.5">
        <h3 id="h-note" className="m-0 text-[13px] font-semibold">
          Internal note <span className="font-normal text-muted">— team only, never in client reports</span>
        </h3>
        <IncidentNoteForm incidentId={incident.id} />
      </section>

      <section aria-labelledby="h-events" className="flex flex-col gap-2 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="h-events" className="m-0 text-[13px] font-semibold">
            Event history
          </h3>
          <div role="group" aria-label="Show events" className="ml-auto flex border border-border-strong">
            {(
              [
                ["all", "All"],
                ["changes", "Changes & notes"],
                ["checks", "Checks"],
              ] as const
            ).map(([v, l]) => (
              <Link
                key={v}
                href={hrefWith("/incidents", params, { ev: v === "all" ? null : v })}
                scroll={false}
                aria-current={filter === v ? "true" : undefined}
                className={`px-2.5 py-1 text-xs no-underline ${filter === v ? "bg-ink text-white hover:text-white" : "text-ink"}`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
        <ol className="m-0 list-none p-0">
          {entries.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[124px_minmax(0,1fr)] gap-3 border-b border-rule-soft py-1.5 text-[13px] last:border-0"
            >
              <span className="font-mono text-xs text-muted">{when(e.at)}</span>
              <span className="min-w-0">
                {e.kind === "check" ? (
                  <>
                    <span aria-hidden="true" className={e.tone}>
                      {e.glyph}
                    </span>{" "}
                    {e.text}
                  </>
                ) : (
                  <>
                    <b className="font-semibold">{e.label}</b>
                    {e.text ? (
                      <span className={e.kind === "note" ? " block whitespace-pre-wrap text-ink-2" : " text-muted"}>
                        {" "}
                        {e.text}
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
