// Public marketing prefixes (docs/pseo-plan.md). Kept in a module without dependencies because
// proxy.ts imports it on every request; lib/seo.ts re-exports it for everything else.

export const MARKETING_PREFIXES = [
  "/alternatives",
  "/compare",
  "/templates",
  "/tools",
  "/domain-expiry",
  "/for",
  "/errors",
] as const;

export type MarketingPrefix = (typeof MARKETING_PREFIXES)[number];
