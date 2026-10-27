import robotsParser from "robots-parser";

// robots.txt (FR-CRAWL-06): respected by default for crawling pages.

export const CRAWLER_TOKEN = "ClientStatusBot";

export type RobotsPolicy = {
  /** "ok" = parsed, "missing" = 404/410 (everything allowed), "error" = unreachable (allowed, but reported). */
  state: "ok" | "missing" | "error";
  status: number | null;
  isAllowed: (url: string) => boolean;
  sitemaps: string[];
  crawlDelaySeconds: number | null;
};

export function parseRobots(robotsUrl: string, body: string, status: number): RobotsPolicy {
  if (status === 404 || status === 410) {
    return { state: "missing", status, isAllowed: () => true, sitemaps: [], crawlDelaySeconds: null };
  }
  if (status >= 400) {
    // Google treats 5xx robots.txt as "disallow all"; we report it and crawl conservatively (start page only).
    return {
      state: "error",
      status,
      isAllowed: (u) => new URL(u).pathname === "/",
      sitemaps: [],
      crawlDelaySeconds: null,
    };
  }
  const robot = robotsParser(robotsUrl, body);
  return {
    state: "ok",
    status,
    isAllowed: (url) => robot.isAllowed(url, CRAWLER_TOKEN) !== false,
    sitemaps: robot.getSitemaps(),
    crawlDelaySeconds: robot.getCrawlDelay(CRAWLER_TOKEN) ?? null,
  };
}

export const ALLOW_ALL: RobotsPolicy = {
  state: "ok",
  status: null,
  isAllowed: () => true,
  sitemaps: [],
  crawlDelaySeconds: null,
};
