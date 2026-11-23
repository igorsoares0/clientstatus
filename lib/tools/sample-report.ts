import type { CrawlResult } from "@/lib/crawler/crawl";
import { formatLongDate } from "@/lib/format";
import type { UptimeResult } from "@/lib/monitoring/classify";
import type { DomainResult } from "@/lib/monitoring/rdap";
import type { SslResult } from "@/lib/monitoring/tls-check";
import { FINDING_LABEL, type ReportData, type SiteReport } from "@/lib/reports/aggregate";
import type { Branding } from "@/lib/reports/render";
import { shortUrl, TOOL_CRAWL_LIMITS } from "@/lib/tools/crawl";

// One-site sample of the monthly report, built from a single snapshot (free health-report tool).
// It's labelled as a sample on the cover, in the summary and in the data notes: one check is
// not a month of monitoring, and a single failed check is never presented as confirmed downtime.

export type Snapshot = {
  url: string;
  checkedAt: Date;
  uptime: UptimeResult;
  ssl: SslResult | null;
  domain: DomainResult | null;
  crawl: CrawlResult | null;
};

const DAY_MS = 86_400_000;
const TZ = "UTC";
const MAX_EXAMPLES = 3;

export const SAMPLE_BRANDING: Branding = {
  agencyName: "Your agency",
  color: null,
  logoDataUri: null,
  contact: "Your name and contact details appear here",
  footer: null,
  credit: true,
};

function sslStatus(ssl: SslResult | null, https: boolean): SiteReport["ssl"]["status"] {
  if (!https) return "none";
  if (!ssl || ssl.status === "inconclusive") return "unknown";
  if (ssl.state === "valid") return "valid";
  if (ssl.state === "expiring") return "expiring";
  return "invalid";
}

function domainStatus(d: DomainResult | null): SiteReport["domain"]["status"] {
  if (!d || d.status === "inconclusive") return "unknown";
  return d.state === "expiring" ? "expiring" : d.state === "unsupported" ? "unsupported" : "ok";
}

/** One summary sentence about the mini audit; says plainly when it stopped early. */
function auditLine(crawl: CrawlResult | null, fix: number): string {
  if (!crawl) return "";
  const found = fix
    ? `found ${fix} item${fix === 1 ? "" : "s"} that affect${fix === 1 ? "s" : ""} visitors, such as broken links`
    : "found nothing that affects visitors";
  if (crawl.status === "partial") {
    const pages = `${crawl.pagesVisited} page${crawl.pagesVisited === 1 ? "" : "s"}`;
    return `A quick audit stopped early after ${pages} (see the audit page for why) and ${found} on ${crawl.pagesVisited === 1 ? "it" : "them"}.`;
  }
  return `A quick audit of ${crawl.pagesVisited} page${crawl.pagesVisited === 1 ? "" : "s"} ${found}.`;
}

export function buildSampleReport(s: Snapshot): ReportData & { code: string } {
  const url = new URL(s.url);
  const host = url.hostname.replace(/^www\./, "");
  const https = url.protocol === "https:";
  const at = s.checkedAt.toISOString();
  const day = new Date(Math.floor(s.checkedAt.getTime() / DAY_MS) * DAY_MS);
  const dayText = formatLongDate(s.checkedAt, TZ);
  const passed = s.uptime.status === "success";
  const conclusive = s.uptime.status !== "inconclusive";
  const response = s.uptime.durationMs ?? null;

  const site: SiteReport = {
    name: host,
    host,
    https,
    monitoredFrom: at,
    uptimePct: conclusive ? (passed ? 100 : 0) : null,
    prevUptimePct: null,
    conclusive: conclusive ? 1 : 0,
    completed: 1,
    expected: 1,
    coveragePct: 100,
    downtimeMinutes: 0,
    pausedMinutes: 0,
    days: [passed ? "ok" : "partial"],
    respMedian: response,
    respP95: response,
    prevRespMedian: null,
    dailyMedians: [response],
    ssl: {
      status: sslStatus(s.ssl, https),
      detail: https ? (s.ssl?.summary ?? "Not checked") : "The site doesn’t use HTTPS",
      expiresAt: s.ssl?.expiresAt?.toISOString() ?? null,
      checkedAt: s.ssl ? at : null,
    },
    domain: {
      status: domainStatus(s.domain),
      detail: s.domain?.summary ?? "Not checked",
      expiresAt: s.domain?.expiresAt?.toISOString() ?? null,
      source: s.domain?.source ?? null,
      checkedAt: s.domain ? at : null,
    },
    audit: s.crawl
      ? {
          date: at,
          status: s.crawl.status,
          pages: s.crawl.pagesVisited,
          budget: TOOL_CRAWL_LIMITS.maxPages,
          links: s.crawl.linksChecked,
          inconclusive: s.crawl.inconclusiveLinks,
          reasons: s.crawl.partialReasons,
        }
      : null,
  };

  const groups = new Map<string, NonNullable<CrawlResult["findings"]>>();
  for (const f of s.crawl?.findings ?? []) groups.set(f.type, [...(groups.get(f.type) ?? []), f]);
  const findings: ReportData["findings"] = [...groups.entries()].map(([type, list]) => {
    const meta = FINDING_LABEL[type] ?? { label: type.replaceAll("_", " "), priority: "improve" as const };
    return {
      priority: meta.priority,
      label: meta.label,
      count: list.length,
      examples: list
        .slice(0, MAX_EXAMPLES)
        .map((f) =>
          f.type === "broken_link" && f.sourceUrl
            ? `${shortUrl(f.sourceUrl, url.origin)} → ${shortUrl(f.targetUrl, url.origin)}${f.statusCode ? ` (${f.statusCode})` : ""}`
            : shortUrl(f.sourceUrl ?? f.targetUrl, url.origin),
        ),
      host,
      firstSeen: at,
    };
  });
  const order = { fix: 0, improve: 1, advisory: 2 };
  findings.sort((a, b) => order[a.priority] - order[b.priority] || b.count - a.count);

  const dates: ReportData["dates"] = [];
  if (site.ssl.expiresAt) dates.push({ date: site.ssl.expiresAt, text: `SSL certificate for ${host} expires` });
  if (site.domain.expiresAt) dates.push({ date: site.domain.expiresAt, text: `Domain registration for ${host} ends` });
  dates.sort((a, b) => a.date.localeCompare(b.date));

  const disclosures = [
    `This is a sample built from a single check of ${host} on ${dayText}, not a monthly report. A monthly report covers every check in the month: uptime every few minutes, SSL every 6 hours, the domain daily and a weekly audit.`,
  ];
  if (!passed) {
    disclosures.push(
      `The site didn’t respond normally to our check (${s.uptime.summary}). Client Status only counts downtime after two failed checks in a row, so this isn’t shown as an outage.`,
    );
  }
  if (s.crawl?.status === "partial") disclosures.push("The mini audit stopped early; see the audit page for why.");
  if (!s.crawl) disclosures.push("The mini audit couldn’t run, so there are no audit findings.");

  const fix = findings.filter((f) => f.priority === "fix").reduce((n, f) => n + f.count, 0);
  const summary = [
    `This sample shows what your client would receive each month, built from one check of ${host} on ${dayText}.`,
    passed
      ? `The website answered our check in ${response ?? "—"} ms.`
      : `The website didn’t respond normally to our check: ${s.uptime.summary}.`,
    site.ssl.status === "invalid"
      ? "Its security certificate has a problem that visitors would notice."
      : site.ssl.status === "expiring"
        ? "Its security certificate renews soon — see “Dates to know”."
        : site.ssl.status === "valid"
          ? "Its security certificate is valid."
          : "",
    auditLine(s.crawl, fix),
  ].filter(Boolean);

  return {
    version: 1,
    kind: "sample",
    code: "SAMPLE",
    client: { name: host, contact: null },
    period: {
      label: `Sample ${dayText}`,
      start: day.toISOString(),
      end: new Date(day.getTime() + DAY_MS).toISOString(),
      tz: TZ,
      days: 1,
      coveredTo: new Date(day.getTime() + DAY_MS).toISOString(),
      toDate: false,
    },
    previousLabel: "Previous month",
    intervalMinutes: 5,
    generatedAt: at,
    sites: [site],
    incidents: [],
    findings,
    findingsTotal: findings.reduce((n, f) => n + f.count, 0),
    openItems: [],
    dates,
    disclosures,
    summary,
    noData: false,
  };
}
