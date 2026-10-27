import { classifyLinkError, classifyLinkResponse, shouldRetry, type LinkOutcome } from "@/lib/crawler/classify";
import { pageFindings, robotsFinding, sitemapFinding, type FindingDraft } from "@/lib/crawler/findings";
import { extractPage } from "@/lib/crawler/html";
import { looksLikeAsset, normalizeCrawlUrl, sameSite } from "@/lib/crawler/normalize";
import { ALLOW_ALL, parseRobots, type RobotsPolicy } from "@/lib/crawler/robots";
import { isBotChallenge } from "@/lib/monitoring/classify";
import type { SafeFetchResult } from "@/lib/monitoring/safe-fetch";

// Bounded, polite crawler (FR-CRAWL-01..12, spec §10.4). Pages are crawled
// breadth-first on the same site; links found on them are then checked, one
// request at a time per host. Everything is capped: pages, depth, requests,
// response bytes and total runtime. Hitting a cap makes the audit "partial".

export type CrawlLimits = {
  maxPages: number;
  maxDepth: number;
  maxRequests: number;
  timeoutMs: number;
  maxRuntimeMs: number;
  /** Minimum delay between requests to the same host. */
  delayMs: number;
  /** Hosts checked in parallel during link checks. */
  hostConcurrency: number;
  respectRobots: boolean;
  /** Wait before re-checking an apparently broken link. */
  retryDelayMs: number;
};

export type Fetcher = (url: string, opts: { maxBytes: number; timeoutMs: number }) => Promise<SafeFetchResult>;

export type CrawlDeps = {
  fetch: Fetcher;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Called regularly so long audits keep their job lease. */
  heartbeat?: () => Promise<void>;
};

export type CrawlResult = {
  status: "completed" | "partial";
  partialReasons: string[];
  pagesVisited: number;
  linksChecked: number;
  requests: number;
  inconclusiveLinks: number;
  /** Pages not crawled because robots.txt disallows them — intentional, so not "partial". */
  skippedByRobots: number;
  brokenInternal: number;
  brokenExternal: number;
  robots: RobotsPolicy["state"] | "ignored";
  findings: FindingDraft[];
};

const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const LINK_MAX_BYTES = 16 * 1024;
const MAX_SOURCES_PER_TARGET = 10;
const MAX_CRAWL_DELAY_MS = 10_000;

class BudgetExhausted extends Error {}

export async function crawlSite(startUrl: string, limits: CrawlLimits, deps: CrawlDeps): Promise<CrawlResult> {
  const started = deps.clock();
  const start = normalizeCrawlUrl(startUrl, startUrl) ?? startUrl;
  const origin = new URL(start).origin;
  const partial = new Set<string>();
  const findings: FindingDraft[] = [];
  let requests = 0;

  const outOfTime = () => deps.clock() - started > limits.maxRuntimeMs;
  const request = async (url: string, maxBytes: number) => {
    if (requests >= limits.maxRequests) throw new BudgetExhausted();
    requests++;
    return deps.fetch(url, { maxBytes, timeoutMs: limits.timeoutMs });
  };

  // ── robots.txt ──
  let robots: RobotsPolicy = ALLOW_ALL;
  if (limits.respectRobots) {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const r = await request(robotsUrl, 512 * 1024);
      robots = parseRobots(robotsUrl, r.bodySnippet, r.status);
    } catch {
      robots = parseRobots(robotsUrl, "", 599);
      robots = { ...robots, status: null };
    }
    const rf = robotsFinding(origin, robots);
    if (rf) findings.push(rf);
    if (robots.state === "error") partial.add("robots.txt unavailable — only the start page was crawled");
  }
  const delayMs = Math.max(limits.delayMs, Math.min((robots.crawlDelaySeconds ?? 0) * 1000, MAX_CRAWL_DELAY_MS));

  // ── pages ──
  const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
  const queued = new Set([start]);
  const pageOutcome = new Map<string, LinkOutcome>();
  const sources = new Map<string, Set<string>>();
  let pagesVisited = 0;
  let skippedByRobots = 0;
  let jsHeavyStart = false;

  const addSource = (target: string, page: string) => {
    let set = sources.get(target);
    if (!set) sources.set(target, (set = new Set()));
    if (set.size < MAX_SOURCES_PER_TARGET) set.add(page);
  };

  try {
    while (queue.length) {
      if (pagesVisited >= limits.maxPages) {
        partial.add(`Page budget reached (${limits.maxPages} page${limits.maxPages === 1 ? "" : "s"})`);
        break;
      }
      if (outOfTime()) {
        partial.add("Time limit reached");
        break;
      }
      const { url, depth } = queue.shift()!;
      if (!robots.isAllowed(url)) {
        skippedByRobots++;
        continue;
      }
      if (pagesVisited > 0) await deps.sleep(delayMs);
      pagesVisited++;
      if (pagesVisited % 10 === 0) await deps.heartbeat?.();

      let res: SafeFetchResult;
      try {
        res = await request(url, PAGE_MAX_BYTES);
      } catch (error) {
        if (error instanceof BudgetExhausted) throw error;
        pageOutcome.set(url, classifyLinkError(error));
        continue;
      }
      pageOutcome.set(
        url,
        classifyLinkResponse({ status: res.status, redirects: res.redirects, botChallenge: isBotChallenge(res) }, true),
      );
      // Redirected off-site, not HTML, or an error page: nothing to parse.
      if (
        res.status !== 200 ||
        !sameSite(res.finalUrl, start) ||
        !(res.headers.contentType ?? "text/html").includes("html")
      )
        continue;

      const facts = extractPage(res.bodySnippet, res.finalUrl);
      findings.push(...pageFindings(res.finalUrl, facts));
      const internalLinks = facts.links.filter((l) => sameSite(l.url, start));
      // Little text, no links, and a JS app shell: the real content is probably rendered client-side.
      if (
        depth === 0 &&
        internalLinks.length === 0 &&
        facts.textLength < 300 &&
        (facts.spaRoot || facts.scriptCount >= 3)
      ) {
        jsHeavyStart = true;
      }

      for (const link of facts.links) {
        addSource(link.url, res.finalUrl);
        const internal = sameSite(link.url, start);
        if (internal && !queued.has(link.url) && !looksLikeAsset(link.url) && depth + 1 <= limits.maxDepth) {
          queued.add(link.url);
          queue.push({ url: link.url, depth: depth + 1 });
        }
      }
    }
    if (queue.length && !partial.size && queue.some((q) => q.depth > limits.maxDepth))
      partial.add(`Depth limit reached (${limits.maxDepth} levels)`);
  } catch (error) {
    if (!(error instanceof BudgetExhausted)) throw error;
    partial.add(`Request budget reached (${limits.maxRequests} requests)`);
  }
  if (jsHeavyStart) partial.add("JavaScript-rendered pages — coverage incomplete");

  // ── sitemap ──
  try {
    const listed = robots.sitemaps.length > 0;
    const sitemapUrl = listed ? robots.sitemaps[0] : `${origin}/sitemap.xml`;
    if (sameSite(sitemapUrl, start)) {
      const s = await request(sitemapUrl, 4096).catch((e) => (e instanceof BudgetExhausted ? Promise.reject(e) : null));
      const sf = sitemapFinding(sitemapUrl, s?.status ?? null, listed);
      if (sf) findings.push(sf);
    }
  } catch {
    /* budget exhausted — already reported */
  }

  // ── links ──
  const outcomes = new Map<string, LinkOutcome>();
  const toCheck: string[] = [];
  for (const target of sources.keys()) {
    const known = pageOutcome.get(target);
    if (known && !shouldRetry(known)) outcomes.set(target, known);
    else if (sameSite(target, start) && !robots.isAllowed(target)) continue;
    else toCheck.push(target);
  }

  const byHost = new Map<string, string[]>();
  for (const t of toCheck) {
    const h = new URL(t).host;
    byHost.set(h, [...(byHost.get(h) ?? []), t]);
  }
  let unchecked = 0;
  const checkOne = async (target: string) => {
    const internal = sameSite(target, start);
    const once = async () => {
      try {
        const r = await request(target, LINK_MAX_BYTES);
        return classifyLinkResponse(
          { status: r.status, redirects: r.redirects, botChallenge: isBotChallenge(r) },
          internal,
        );
      } catch (error) {
        if (error instanceof BudgetExhausted) throw error;
        return classifyLinkError(error);
      }
    };
    let outcome = pageOutcome.get(target) ?? (await once());
    if (shouldRetry(outcome)) {
      await deps.sleep(limits.retryDelayMs);
      const second = await once();
      // Broken only if it fails the same way twice.
      outcome = second.kind === "broken" ? outcome : second;
    }
    outcomes.set(target, outcome);
  };

  const hosts = [...byHost.values()];
  let checked = 0;
  const workers = Array.from({ length: Math.min(limits.hostConcurrency, hosts.length) }, async () => {
    for (;;) {
      const list = hosts.shift();
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        if (outOfTime() || requests >= limits.maxRequests) {
          unchecked += list.length - i;
          break;
        }
        if (i > 0) await deps.sleep(delayMs);
        try {
          await checkOne(list[i]);
        } catch (error) {
          if (!(error instanceof BudgetExhausted)) throw error;
          unchecked += list.length - i;
          break;
        }
        if (++checked % 25 === 0) await deps.heartbeat?.();
      }
    }
  });
  await Promise.all(workers);
  if (unchecked) {
    partial.add(
      requests >= limits.maxRequests
        ? `Request budget reached — ${unchecked} link${unchecked === 1 ? "" : "s"} not checked`
        : `${unchecked} link${unchecked === 1 ? "" : "s"} not checked (time limit)`,
    );
  }

  // ── link findings ──
  let brokenInternal = 0;
  let brokenExternal = 0;
  let inconclusiveLinks = 0;
  for (const [target, outcome] of outcomes) {
    const internal = sameSite(target, start);
    if (outcome.kind === "inconclusive") inconclusiveLinks++;
    if (outcome.kind !== "broken" && outcome.kind !== "redirect_issue") continue;
    if (outcome.kind === "broken") {
      if (internal) brokenInternal++;
      else brokenExternal++;
    }
    for (const source of sources.get(target) ?? []) {
      findings.push(
        outcome.kind === "broken"
          ? {
              type: "broken_link",
              severity: internal ? "high" : "medium",
              sourceUrl: source,
              targetUrl: target,
              statusCode: outcome.status,
              summary: `${internal ? "Broken internal link" : "Broken external link"} — ${outcome.reason}`,
            }
          : {
              type: outcome.reason === "Redirect loop" ? "redirect_loop" : "redirect_chain",
              severity: outcome.reason === "Redirect loop" ? "high" : "low",
              sourceUrl: source,
              targetUrl: target,
              statusCode: null,
              summary:
                outcome.reason === "Redirect loop"
                  ? "Link leads to a redirect loop"
                  : `Long redirect chain — ${outcome.reason}`,
            },
      );
    }
  }

  return {
    status: partial.size ? "partial" : "completed",
    partialReasons: [...partial],
    pagesVisited,
    linksChecked: outcomes.size,
    requests,
    inconclusiveLinks,
    skippedByRobots,
    brokenInternal,
    brokenExternal,
    robots: limits.respectRobots ? robots.state : "ignored",
    findings,
  };
}
