import type { FeatureKey, Support } from "@/content/competitors";
import { SSL_THRESHOLD_DAYS } from "@/lib/monitoring/tls-check";
import { LINK_EXPIRY_OPTIONS } from "@/lib/notify/settings";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

// Client Status's own column in the comparison tables. Read from the code that enforces it
// (plans, SSL thresholds, report link expiry) so the marketing pages can't drift from the product.
// Not shipped, so never claimed: team invites, a custom report domain, status pages, SMS/Slack alerts.

const plans = PLAN_ORDER.map((k) => PLANS[k]);
const minutes = plans.map((p) => p.uptimeIntervalSeconds / 60);
const pages = plans.map((p) => p.maxPagesPerAudit.toLocaleString("en-US"));
const fullBranding = plans.filter((p) => p.reportBranding !== "basic").map((p) => p.name);
const creditPlans = plans.filter((p) => p.reportBranding === "basic").map((p) => p.name);

const list = (items: readonly (string | number)[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export const CLIENT_STATUS_FEATURES: Record<FeatureKey, Support> = {
  uptime: true,
  ssl: true,
  domainExpiry: true,
  brokenLinks: true,
  clientReports: true,
  whiteLabel: true,
  clientNoLogin: true,
  platformAgnostic: true,
};

export const CLIENT_STATUS_NOTES: Record<FeatureKey, string> = {
  uptime: `Every ${Math.min(...minutes)}–${Math.max(...minutes)} minutes by plan; down only after two failed checks in a row. Timeouts, rate limits and bot challenges count as inconclusive, not as up or down.`,
  ssl: `Checked every 6 hours; warns ${list(SSL_THRESHOLD_DAYS)} days before expiry.`,
  domainExpiry: "Daily via RDAP; shows “n/a” when a registry doesn't publish a date.",
  brokenLinks: `Weekly crawl of up to ${list(pages)} pages by plan; a broken link is confirmed twice. Also flags missing titles, descriptions, headings and canonical tags.`,
  clientReports: "Monthly on the 1st: a PDF and a private link per client, held for your review by default.",
  whiteLabel: `Full branding without a Client Status credit on ${list(fullBranding)}; ${list(creditPlans)} reports carry a small credit.`,
  clientNoLogin: `Clients get a PDF by email or a private link that expires after ${list(LINK_EXPIRY_OPTIONS)} days.`,
  platformAgnostic: "Checks any public website from the outside; nothing to install on client sites.",
};

/** "Starter $49/month (15 sites), Growth $99 (50) and Pro $199 (150)" */
export function clientStatusPricing(): string {
  const parts = plans.map((p, i) =>
    i === 0
      ? `${p.name} $${p.priceUsdMonthly}/month (${p.maxActiveSites} sites)`
      : `${p.name} $${p.priceUsdMonthly} (${p.maxActiveSites})`,
  );
  return list(parts);
}
