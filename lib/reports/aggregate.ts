import type { PrismaClient } from "@/lib/generated/prisma/client";
import { formatLongDate } from "@/lib/format";
import { zonedTimeToUtc, type Period } from "@/lib/reports/period";

// Monthly report data (spec §11, FR-REP-03..05/11). Summarises the period from
// stored history — never just the latest check — and discloses every gap
// instead of estimating. The result is a JSON snapshot the report is rendered
// from, so a sent report never changes.

export type DayState = "ok" | "down" | "partial" | "gap";
export type Priority = "fix" | "improve" | "advisory";

export type SiteReport = {
  name: string;
  host: string;
  https: boolean;
  monitoredFrom: string;
  uptimePct: number | null;
  prevUptimePct: number | null;
  conclusive: number;
  completed: number;
  expected: number;
  coveragePct: number | null;
  downtimeMinutes: number;
  pausedMinutes: number;
  days: DayState[];
  respMedian: number | null;
  respP95: number | null;
  prevRespMedian: number | null;
  dailyMedians: (number | null)[];
  ssl: {
    status: "valid" | "expiring" | "invalid" | "none" | "unknown";
    detail: string;
    expiresAt: string | null;
    checkedAt: string | null;
  };
  domain: {
    status: "ok" | "expiring" | "unsupported" | "unknown";
    detail: string;
    expiresAt: string | null;
    source: string | null;
    checkedAt: string | null;
  };
  audit: {
    date: string;
    status: "completed" | "partial";
    pages: number;
    budget: number;
    links: number;
    inconclusive: number;
    reasons: string[];
  } | null;
};

export type ReportData = {
  version: 1;
  kind: "monthly" | "preview";
  client: { name: string; contact: string | null };
  period: { label: string; start: string; end: string; tz: string; days: number; coveredTo: string; toDate: boolean };
  previousLabel: string;
  intervalMinutes: number;
  generatedAt: string;
  sites: SiteReport[];
  incidents: { host: string; title: string; start: string; end: string | null; minutes: number; resolved: boolean }[];
  findings: { priority: Priority; label: string; count: number; examples: string[]; host: string; firstSeen: string }[];
  findingsTotal: number;
  openItems: { item: string; sub: string; since: string; status: string }[];
  dates: { date: string; text: string }[];
  disclosures: string[];
  summary: string[];
  noData: boolean;
};

const DAY_MS = 86_400_000;

const FINDING_LABEL: Record<string, { label: string; priority: Priority }> = {
  broken_link: { label: "Broken links", priority: "fix" },
  redirect_loop: { label: "Links that loop forever", priority: "fix" },
  redirect_chain: { label: "Links with long redirect chains", priority: "improve" },
  missing_title: { label: "Pages without a title", priority: "improve" },
  missing_meta_description: { label: "Pages without a meta description", priority: "improve" },
  missing_canonical: { label: "Pages without a canonical URL", priority: "improve" },
  malformed_canonical: { label: "Malformed or off-site canonical URLs", priority: "improve" },
  missing_h1: { label: "Pages without a main heading", priority: "improve" },
  multiple_h1: { label: "Pages with more than one main heading", priority: "advisory" },
  robots_unavailable: { label: "robots.txt couldn’t be read", priority: "improve" },
  sitemap_unavailable: { label: "Sitemap couldn’t be read", priority: "improve" },
};

function overlapMs(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : null;
}

function fmtMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/** Paused intervals for a site within [from, to), from the audit trail. */
async function pausedIntervals(db: PrismaClient, siteId: string, from: number, to: number) {
  const events = await db.auditLog.findMany({
    where: {
      resourceType: "site",
      resourceId: siteId,
      action: { in: ["site.paused", "site.resumed", "site.archived", "site.restored"] },
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true },
  });
  const intervals: [number, number][] = [];
  let pausedAt: number | null = null;
  for (const e of events) {
    const t = e.createdAt.getTime();
    if ((e.action === "site.paused" || e.action === "site.archived") && pausedAt === null) pausedAt = t;
    if ((e.action === "site.resumed" || e.action === "site.restored") && pausedAt !== null) {
      intervals.push([pausedAt, t]);
      pausedAt = null;
    }
  }
  if (pausedAt !== null) intervals.push([pausedAt, to]);
  return intervals.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number]).filter(([a, b]) => b > a);
}

async function uptimeCounts(db: PrismaClient, siteId: string, from: Date, to: Date) {
  const rows = await db.monitorCheck.groupBy({
    by: ["status"],
    where: { siteId, checkType: "uptime", checkedAt: { gte: from, lt: to } },
    _count: true,
  });
  const get = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { success: get("success"), failure: get("failure"), inconclusive: get("inconclusive") };
}

async function responseStats(db: PrismaClient, siteId: string, from: Date, to: Date) {
  const rows = await db.$queryRaw<{ median: number | null; p95: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95
    FROM "monitor_check"
    WHERE "siteId" = ${siteId} AND "checkType" = 'uptime' AND "status" = 'success' AND "durationMs" IS NOT NULL
      AND "checkedAt" >= ${from} AND "checkedAt" < ${to}`;
  const r = rows[0];
  return {
    median: r?.median == null ? null : Math.round(Number(r.median)),
    p95: r?.p95 == null ? null : Math.round(Number(r.p95)),
  };
}

export type BuildInput = {
  workspaceId: string;
  clientId: string;
  period: Period;
  previous: Period;
  tz: string;
  intervalMs: number;
  agencyName: string;
  kind: "monthly" | "preview";
  now: Date;
};

export async function buildReportData(db: PrismaClient, input: BuildInput): Promise<ReportData> {
  const { period, previous, tz, intervalMs, now } = input;
  const start = period.start.getTime();
  // A preview covers the month so far; a monthly report the whole month.
  const end = Math.min(period.end.getTime(), now.getTime());
  const toDate = end < period.end.getTime();
  // Local day boundaries (DST-safe) and the first local date, for day-by-day figures.
  const firstDay = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
  const dayStarts = Array.from({ length: period.days + 1 }, (_, i) =>
    i === period.days ? period.end.getTime() : zonedTimeToUtc(period.year, period.month, i + 1, 0, tz).getTime(),
  );

  const client = await db.client.findUniqueOrThrow({
    where: { id: input.clientId },
    select: { name: true, contactName: true },
  });
  const sites = await db.site.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      createdAt: { lt: new Date(end) },
      OR: [{ archivedAt: null }, { archivedAt: { gte: period.start } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, normalizedHostname: true, baseUrl: true, createdAt: true, archivedAt: true },
  });

  const disclosures: string[] = [];
  const siteReports: SiteReport[] = [];
  const incidents: ReportData["incidents"] = [];
  const findingsOut: ReportData["findings"] = [];
  const openItems: ReportData["openItems"] = [];
  const dates: ReportData["dates"] = [];
  let findingsTotal = 0;
  let anyChecks = false;

  for (const site of sites) {
    const from = Math.max(start, site.createdAt.getTime());
    const to = Math.min(end, site.archivedAt?.getTime() ?? end);
    if (to <= from) continue;
    const paused = await pausedIntervals(db, site.id, from, to);
    const pausedMs = paused.reduce((n, [a, b]) => n + (b - a), 0);
    const expected = Math.max(0, Math.floor((to - from - pausedMs) / intervalMs));
    const counts = await uptimeCounts(db, site.id, new Date(from), new Date(to));
    const conclusive = counts.success + counts.failure;
    const completed = conclusive + counts.inconclusive;
    if (completed > 0) anyChecks = true;
    const coverage = expected > 0 ? Math.min(100, pct(completed, expected)!) : null;

    // Previous month, only when it's comparable (whole month monitored, ≥ 90% coverage).
    let prevUptime: number | null = null;
    if (site.createdAt.getTime() <= previous.start.getTime()) {
      const pc = await uptimeCounts(db, site.id, previous.start, previous.end);
      const prevExpected = Math.floor((previous.end.getTime() - previous.start.getTime()) / intervalMs);
      const pcCompleted = pc.success + pc.failure + pc.inconclusive;
      if (prevExpected > 0 && pcCompleted / prevExpected >= 0.9) prevUptime = pct(pc.success, pc.success + pc.failure);
    }

    // Confirmed downtime from downtime incidents overlapping the window.
    const downs = await db.incident.findMany({
      where: {
        siteId: site.id,
        type: { in: ["downtime", "ssl_invalid"] },
        firstDetectedAt: { lt: new Date(to) },
        OR: [{ resolvedAt: null }, { resolvedAt: { gt: new Date(from) } }],
      },
      orderBy: { firstDetectedAt: "asc" },
      select: { type: true, title: true, firstDetectedAt: true, resolvedAt: true, status: true },
    });
    let downtimeMs = 0;
    for (const d of downs) {
      const a = d.firstDetectedAt.getTime();
      const b = d.resolvedAt?.getTime() ?? to;
      const ms = overlapMs(a, b, from, to);
      if (d.type === "downtime") downtimeMs += ms;
      incidents.push({
        host: site.normalizedHostname,
        title: d.title,
        start: d.firstDetectedAt.toISOString(),
        end: d.resolvedAt?.toISOString() ?? null,
        minutes: Math.max(1, Math.round((b - a) / 60_000)),
        resolved: d.resolvedAt !== null && d.resolvedAt.getTime() <= end,
      });
    }

    // Day by day, in the workspace timezone.
    const dayRows = await db.$queryRaw<{ day: number; status: string; n: bigint }[]>`
      SELECT (("checkedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date - ${firstDay}::date AS day, "status"::text AS status, count(*) AS n
      FROM "monitor_check"
      WHERE "siteId" = ${site.id} AND "checkType" = 'uptime' AND "checkedAt" >= ${new Date(from)} AND "checkedAt" < ${new Date(to)}
      GROUP BY 1, 2`;
    const days: DayState[] = Array.from({ length: period.days }, () => "gap");
    const perDay = new Map<number, { s: number; f: number; i: number }>();
    for (const r of dayRows) {
      const d = perDay.get(r.day) ?? { s: 0, f: 0, i: 0 };
      if (r.status === "success") d.s += Number(r.n);
      else if (r.status === "failure") d.f += Number(r.n);
      else d.i += Number(r.n);
      perDay.set(r.day, d);
    }
    for (let i = 0; i < period.days; i++) {
      const d0 = dayStarts[i];
      const d1 = dayStarts[i + 1];
      const windowMs = overlapMs(d0, d1, from, to) - paused.reduce((n, [a, b]) => n + overlapMs(a, b, d0, d1), 0);
      if (windowMs <= 0) continue;
      const c = perDay.get(i);
      if (!c) continue;
      const downThatDay = downs.some(
        (x) =>
          x.type === "downtime" && overlapMs(x.firstDetectedAt.getTime(), x.resolvedAt?.getTime() ?? to, d0, d1) > 0,
      );
      const expectedDay = windowMs / intervalMs;
      days[i] = downThatDay ? "down" : (c.s + c.f + c.i) / expectedDay >= 0.95 && c.i === 0 ? "ok" : "partial";
    }

    const resp = await responseStats(db, site.id, new Date(from), new Date(to));
    const prevResp =
      site.createdAt.getTime() <= previous.start.getTime()
        ? await responseStats(db, site.id, previous.start, previous.end)
        : { median: null };
    const medianRows = await db.$queryRaw<{ day: number; median: number }[]>`
      SELECT (("checkedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date - ${firstDay}::date AS day,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median
      FROM "monitor_check"
      WHERE "siteId" = ${site.id} AND "checkType" = 'uptime' AND "status" = 'success' AND "durationMs" IS NOT NULL
        AND "checkedAt" >= ${new Date(from)} AND "checkedAt" < ${new Date(to)}
      GROUP BY 1`;
    const dailyMedians: (number | null)[] = Array.from({ length: period.days }, () => null);
    for (const r of medianRows)
      if (r.day >= 0 && r.day < period.days) dailyMedians[r.day] = Math.round(Number(r.median));

    // Certificate and domain as last seen in the period.
    const https = site.baseUrl.startsWith("https://");
    const lastSsl = https
      ? await db.monitorCheck.findFirst({
          where: {
            siteId: site.id,
            checkType: "ssl",
            status: { not: "inconclusive" },
            checkedAt: { lt: new Date(to) },
          },
          orderBy: { checkedAt: "desc" },
          select: { status: true, summary: true, metadata: true, checkedAt: true, failureCategory: true },
        })
      : null;
    const sslExpires = (lastSsl?.metadata as { expiresAt?: string } | null)?.expiresAt ?? null;
    const ssl: SiteReport["ssl"] = !https
      ? { status: "none", detail: "No certificate — checked over http only", expiresAt: null, checkedAt: null }
      : !lastSsl
        ? { status: "unknown", detail: "Not checked in this period", expiresAt: null, checkedAt: null }
        : {
            status:
              lastSsl.status === "failure" ? "invalid" : lastSsl.failureCategory === "expiring" ? "expiring" : "valid",
            detail: lastSsl.summary,
            expiresAt: sslExpires,
            checkedAt: lastSsl.checkedAt.toISOString(),
          };
    const lastDomain = await db.monitorCheck.findFirst({
      where: { siteId: site.id, checkType: "domain", status: "success", checkedAt: { lt: new Date(to) } },
      orderBy: { checkedAt: "desc" },
      select: { summary: true, metadata: true, checkedAt: true },
    });
    const domMeta = lastDomain?.metadata as { expiresAt?: string; source?: string } | null;
    const domExpires = domMeta?.expiresAt ?? null;
    const domain: SiteReport["domain"] = !lastDomain
      ? { status: "unknown", detail: "Not checked in this period", expiresAt: null, source: null, checkedAt: null }
      : !domExpires
        ? {
            status: "unsupported",
            detail: "Not published by the registry",
            expiresAt: null,
            source: null,
            checkedAt: lastDomain.checkedAt.toISOString(),
          }
        : {
            status: new Date(domExpires).getTime() - end <= 30 * DAY_MS ? "expiring" : "ok",
            detail: lastDomain.summary,
            expiresAt: domExpires,
            source: domMeta?.source ?? null,
            checkedAt: lastDomain.checkedAt.toISOString(),
          };

    // Latest finished audit before the end of the period.
    const run = await db.auditRun.findFirst({
      where: { siteId: site.id, status: { in: ["completed", "partial"] }, completedAt: { lt: new Date(end) } },
      orderBy: { completedAt: "desc" },
    });
    let audit: SiteReport["audit"] = null;
    if (run?.completedAt) {
      audit = {
        date: run.completedAt.toISOString(),
        status: run.status === "partial" ? "partial" : "completed",
        pages: run.pagesVisited,
        budget: run.pagesBudget,
        links: run.linksChecked,
        inconclusive: run.inconclusiveLinks,
        reasons: run.partialReasons,
      };
      const found = await db.auditFinding.findMany({
        where: {
          siteId: site.id,
          firstSeenAt: { lte: run.completedAt },
          lastSeenAt: { gte: run.startedAt ?? run.createdAt },
        },
        select: { type: true, sourceUrl: true, targetUrl: true, firstSeenAt: true },
      });
      findingsTotal += found.length;
      const byType = new Map<string, typeof found>();
      for (const f of found) byType.set(f.type, [...(byType.get(f.type) ?? []), f]);
      for (const [type, list] of byType) {
        const meta = FINDING_LABEL[type] ?? { label: type.replaceAll("_", " "), priority: "improve" as const };
        const path = (u: string | null) => {
          if (!u) return "";
          try {
            const x = new URL(u);
            return x.hostname.replace(/^www\./, "") === site.normalizedHostname
              ? x.pathname || "/"
              : `${x.host}${x.pathname}`;
          } catch {
            return u;
          }
        };
        findingsOut.push({
          priority: meta.priority,
          label: meta.label,
          count: list.length,
          examples: list
            .slice(0, 3)
            .map((f) =>
              f.targetUrl && f.sourceUrl
                ? `${path(f.sourceUrl)} → ${path(f.targetUrl)}`
                : path(f.sourceUrl ?? f.targetUrl),
            ),
          host: site.normalizedHostname,
          firstSeen: list.reduce((m, f) => (f.firstSeenAt < m ? f.firstSeenAt : m), list[0].firstSeenAt).toISOString(),
        });
      }
      if (run.status === "partial") {
        disclosures.push(
          `${site.normalizedHostname}: the latest audit (${formatLongDate(run.completedAt, tz)}) was partial — ${run.partialReasons.join("; ")}.`,
        );
      }
      if (run.completedAt.getTime() < start) {
        disclosures.push(
          `${site.normalizedHostname}: no audit finished in ${period.label}; findings are from ${formatLongDate(run.completedAt, tz)}.`,
        );
      }
    } else {
      disclosures.push(`${site.normalizedHostname}: no audit has finished yet, so there are no audit findings.`);
    }

    // Disclosures for this site.
    if (site.createdAt.getTime() > start) {
      disclosures.push(
        `${site.normalizedHostname}: monitoring started on ${formatLongDate(site.createdAt, tz)} — figures cover ${formatLongDate(site.createdAt, tz)} onwards only.`,
      );
    }
    if (pausedMs > 0) {
      disclosures.push(
        `${site.normalizedHostname}: monitoring was paused for ${fmtMinutes(Math.round(pausedMs / 60_000))} — that time is a gap, not counted as up.`,
      );
    }
    if (coverage !== null && coverage < 99 && completed > 0) {
      const missingMin = Math.round(((expected - completed) * intervalMs) / 60_000);
      disclosures.push(
        `${site.normalizedHostname}: ${coverage.toFixed(1)}% of expected checks ran — about ${fmtMinutes(Math.max(missingMin, 0))} without results is left out, not counted as up.`,
      );
    }
    if (completed === 0) disclosures.push(`${site.normalizedHostname}: no checks ran in this period.`);
    if (domain.status === "unsupported")
      disclosures.push(
        `${site.normalizedHostname}: the domain registry doesn’t publish an expiry date, so none is shown.`,
      );

    // Open items and dates.
    for (const d of downs.filter((x) => x.status !== "resolved" || (x.resolvedAt && x.resolvedAt.getTime() > end))) {
      openItems.push({
        item: d.title,
        sub: site.normalizedHostname,
        since: d.firstDetectedAt.toISOString(),
        status: d.status === "acknowledged" ? "Being worked on" : "Open",
      });
    }
    const fixCount = findingsOut
      .filter((f) => f.host === site.normalizedHostname && f.priority === "fix")
      .reduce((n, f) => n + f.count, 0);
    if (fixCount && audit)
      openItems.push({
        item: `${fixCount} audit item${fixCount === 1 ? "" : "s"} to fix`,
        sub: site.normalizedHostname,
        since: audit.date,
        status: "Open",
      });
    for (const [what, iso] of [
      ["SSL certificate expires", ssl.expiresAt],
      ["Domain registration expires", domain.expiresAt],
    ] as const) {
      if (iso && new Date(iso).getTime() - end <= 90 * DAY_MS)
        dates.push({ date: iso, text: `${what} — ${site.normalizedHostname}` });
    }

    siteReports.push({
      name: site.name,
      host: site.normalizedHostname,
      https,
      monitoredFrom: new Date(from).toISOString(),
      uptimePct: pct(counts.success, conclusive),
      prevUptimePct: prevUptime,
      conclusive,
      completed,
      expected,
      coveragePct: coverage,
      downtimeMinutes: Math.round(downtimeMs / 60_000),
      pausedMinutes: Math.round(pausedMs / 60_000),
      days,
      respMedian: resp.median,
      respP95: resp.p95,
      prevRespMedian: prevResp.median,
      dailyMedians,
      ssl,
      domain,
      audit,
    });
  }

  if (toDate)
    disclosures.unshift(
      `Preview covering ${period.label} up to ${formatLongDate(new Date(end), tz)} — not the full month.`,
    );
  dates.sort((a, b) => a.date.localeCompare(b.date));
  const priorityOrder: Record<Priority, number> = { fix: 0, improve: 1, advisory: 2 };
  findingsOut.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.count - a.count);

  return {
    version: 1,
    kind: input.kind,
    client: { name: client.name, contact: client.contactName },
    period: {
      label: period.label,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      tz,
      days: period.days,
      coveredTo: new Date(end).toISOString(),
      toDate,
    },
    previousLabel: previous.label.split(" ")[0],
    intervalMinutes: Math.round(intervalMs / 60_000),
    generatedAt: now.toISOString(),
    sites: siteReports,
    incidents,
    findings: findingsOut,
    findingsTotal,
    openItems,
    dates,
    disclosures,
    summary: summarise(siteReports, findingsOut, period.label),
    noData: !anyChecks,
  };
}

/** Plain-language summary built only from the figures above. */
export function summarise(sites: SiteReport[], findings: ReportData["findings"], label: string): string[] {
  if (sites.length === 0) return [`No websites were monitored for this client in ${label}.`];
  const month = label.split(" ")[0];
  const down = sites.filter((s) => s.downtimeMinutes > 0);
  const out: string[] = [];
  const your = sites.length === 1 ? "Your website" : `All ${sites.length} of your websites`;
  if (down.length === 0) {
    out.push(
      `${your} ${sites.length === 1 ? "was" : "were"} online for every check that ran in ${month}, with no confirmed outages.`,
    );
  } else {
    for (const s of down) out.push(`${s.name} had ${fmtMinutes(s.downtimeMinutes)} of confirmed downtime in ${month}.`);
  }
  const certIssues = sites.filter((s) => s.ssl.status === "invalid");
  const expiring = sites.filter((s) => s.ssl.status === "expiring" || s.domain.status === "expiring");
  if (certIssues.length)
    out.push(
      `${certIssues.map((s) => s.host).join(" and ")} had a security certificate problem that visitors would notice.`,
    );
  else if (expiring.length)
    out.push(`A renewal is coming up for ${expiring.map((s) => s.host).join(" and ")} — see “Dates to know”.`);
  const fix = findings.filter((f) => f.priority === "fix").reduce((n, f) => n + f.count, 0);
  if (fix)
    out.push(
      `The latest audit found ${fix} item${fix === 1 ? "" : "s"} that affect${fix === 1 ? "s" : ""} visitors, such as broken links.`,
    );
  return out;
}
