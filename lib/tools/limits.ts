import { allow, defaultStore, type RateLimitStore } from "@/lib/rate-limit";

// Rate limits for the free public tools (docs/pseo-plan.md §4.1). Every check hits all of its
// counters, so a refused request still counts. Counters are shared through Postgres
// (lib/rate-limit.ts) and keys are stored hashed, because they contain IPs and emails.

export const TOOL_SLUGS = [
  "ssl-checker",
  "domain-expiry-checker",
  "broken-link-checker",
  "website-health-report",
] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Per IP: 10 lookups per 10 minutes. Global caps keep one tool from eating the worker or our IP reputation. */
const GLOBAL_PER_HOUR: Record<ToolSlug, number> = {
  "ssl-checker": 600,
  "domain-expiry-checker": 600,
  "broken-link-checker": 60,
  "website-health-report": 60,
};

export async function allowToolRequest(
  tool: ToolSlug,
  ip: string,
  now = Date.now(),
  store: RateLimitStore = defaultStore(),
): Promise<boolean> {
  const results = await Promise.all([
    allow(`tool:${tool}:ip:${ip}`, 10, 10 * MIN, now, store),
    allow(`tool:${tool}:global`, GLOBAL_PER_HOUR[tool], HOUR, now, store),
  ]);
  return results.every(Boolean);
}

/**
 * The health report emails whoever's address is typed in, so it's limited per address too,
 * with a daily cap on everything we send this way: nobody can use it to flood an inbox.
 */
export async function allowReportEmail(
  email: string,
  ip: string,
  now = Date.now(),
  store: RateLimitStore = defaultStore(),
): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const results = await Promise.all([
    allow(`tool-email:addr:${address}`, 2, DAY, now, store),
    allow(`tool-email:ip:${ip}`, 3, HOUR, now, store),
    allow(`tool-email:global`, 200, DAY, now, store),
  ]);
  return results.every(Boolean);
}
