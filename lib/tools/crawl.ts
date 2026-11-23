import { crawlSite, type CrawlLimits, type CrawlResult } from "@/lib/crawler/crawl";
import type { FindingDraft } from "@/lib/crawler/findings";
import { safeFetch, type SafeFetchOptions } from "@/lib/monitoring/safe-fetch";
import { FINDING_LABEL } from "@/lib/reports/aggregate";
import { TOOL_CRAWL_LIMITS } from "@/lib/tools/crawl-limits";

export { TOOL_CRAWL_LIMITS };

// The free broken-link checker and the health report's mini audit: the product's crawler with
// tight limits. robots.txt is always respected and the User-Agent is the usual one (/bot).

export type ToolCrawlDeps = {
  fetch?: Pick<SafeFetchOptions, "resolver" | "allowPrivate">;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  heartbeat?: () => Promise<void>;
  limits?: Partial<CrawlLimits>;
};

export function runToolCrawl(url: string, deps: ToolCrawlDeps = {}): Promise<CrawlResult> {
  const limits = { ...TOOL_CRAWL_LIMITS, ...deps.limits };
  return crawlSite(url, limits, {
    fetch: (u, o) => safeFetch(u, { timeoutMs: o.timeoutMs, maxBytes: o.maxBytes, ...deps.fetch }),
    clock: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    heartbeat: deps.heartbeat,
  });
}

const MAX_BROKEN_LISTED = 100;
const MAX_EXAMPLES = 5;

export type LinkToolResult = {
  url: string;
  status: CrawlResult["status"];
  partialReasons: string[];
  pagesVisited: number;
  pageBudget: number;
  linksChecked: number;
  inconclusiveLinks: number;
  skippedByRobots: number;
  robots: CrawlResult["robots"];
  brokenTotal: number;
  broken: { target: string; source: string | null; statusCode: number | null; summary: string }[];
  /** Other basic checks found along the way, grouped like the monthly report. */
  otherFindings: { label: string; priority: string; count: number; examples: string[] }[];
};

/** Path + query for a same-site URL, the full URL otherwise; keeps lists short and readable. */
export function shortUrl(url: string | null, origin: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.origin === origin ? `${u.pathname}${u.search}` || "/" : url;
  } catch {
    return url;
  }
}

export function summariseCrawl(url: string, r: CrawlResult, pageBudget = TOOL_CRAWL_LIMITS.maxPages): LinkToolResult {
  const origin = new URL(url).origin;
  const broken = r.findings.filter((f) => f.type === "broken_link" || f.type === "redirect_loop");
  const others = new Map<string, FindingDraft[]>();
  for (const f of r.findings) {
    if (f.type === "broken_link" || f.type === "redirect_loop") continue;
    others.set(f.type, [...(others.get(f.type) ?? []), f]);
  }
  return {
    url,
    status: r.status,
    partialReasons: r.partialReasons,
    pagesVisited: r.pagesVisited,
    pageBudget,
    linksChecked: r.linksChecked,
    inconclusiveLinks: r.inconclusiveLinks,
    skippedByRobots: r.skippedByRobots,
    robots: r.robots,
    brokenTotal: broken.length,
    broken: broken.slice(0, MAX_BROKEN_LISTED).map((f) => ({
      target: shortUrl(f.targetUrl, origin),
      source: f.sourceUrl ? shortUrl(f.sourceUrl, origin) : null,
      statusCode: f.statusCode,
      summary: f.summary,
    })),
    otherFindings: [...others.entries()].map(([type, list]) => {
      const meta = FINDING_LABEL[type] ?? { label: type.replaceAll("_", " "), priority: "improve" };
      return {
        label: meta.label,
        priority: meta.priority,
        count: list.length,
        examples: list.slice(0, MAX_EXAMPLES).map((f) => shortUrl(f.sourceUrl ?? f.targetUrl, origin)),
      };
    }),
  };
}
