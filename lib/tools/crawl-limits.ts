import type { CrawlLimits } from "@/lib/crawler/crawl";

// Crawl limits for the free broken-link checker and the health report's mini audit. Kept apart
// from lib/tools/crawl.ts so page copy and SEO data can quote them without loading the crawler.

export const TOOL_CRAWL_LIMITS: CrawlLimits = {
  maxPages: 50,
  maxDepth: 3,
  maxRequests: 400,
  timeoutMs: 8_000,
  maxRuntimeMs: 3 * 60_000,
  delayMs: 500,
  hostConcurrency: 4,
  respectRobots: true,
  retryDelayMs: 2_000,
};

export const TOOL_CRAWL_MAX_PAGES = TOOL_CRAWL_LIMITS.maxPages;
