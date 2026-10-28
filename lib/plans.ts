// Plan configuration (FR-BILL-02). The single source for prices and limits —
// UI and server enforcement both read from here. Spec §5 has the same table;
// values must stay changeable without schema changes.

export type PlanKey = "starter" | "growth" | "pro";

/** Billing period of a subscription. Yearly is priced at ten months ("2 months free"). */
export type BillingInterval = "month" | "year";
export const BILLING_INTERVALS: BillingInterval[] = ["month", "year"];

/**
 * Report branding (spec §5): basic = logo, colour and contact line, with a small
 * "Prepared with Client Status" credit; standard = adds a custom footer and drops
 * the credit; advanced = standard plus the custom report domain once it ships (P1).
 */
export type ReportBranding = "basic" | "standard" | "advanced";

export const BRANDING_LABEL: Record<ReportBranding, string> = {
  basic: "Logo, colour and contact line",
  standard: "Full branding, custom footer, no Client Status credit",
  advanced: "Full white-label (custom report domain planned)",
};

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsdMonthly: number;
  priceUsdYearly: number;
  maxActiveSites: number;
  uptimeIntervalSeconds: number;
  maxTeamMembers: number;
  /** Starter's 500 is from spec §10.4; Growth/Pro are placeholders until load testing. */
  maxPagesPerAudit: number;
  /** Total requests per audit (pages + link checks + robots/sitemap). */
  maxRequestsPerAudit: number;
  maxAuditDepth: number;
  /** Scheduled audits run every N days (weekly on every plan; see docs/load-test.md for the crawl budget). */
  auditEveryDays: number;
  manualAuditsPerWeek: number;
  /** Wall-clock cap per audit; crawling is paced (~1 page/s), so this bounds coverage too. */
  maxAuditMinutes: number;
  reportBranding: ReportBranding;
};

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    priceUsdMonthly: 49,
    priceUsdYearly: 490,
    maxActiveSites: 15,
    uptimeIntervalSeconds: 300,
    maxTeamMembers: 1,
    maxPagesPerAudit: 500,
    maxRequestsPerAudit: 3000,
    maxAuditDepth: 5,
    auditEveryDays: 7,
    manualAuditsPerWeek: 1,
    maxAuditMinutes: 15,
    reportBranding: "basic",
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceUsdMonthly: 99,
    priceUsdYearly: 990,
    maxActiveSites: 50,
    uptimeIntervalSeconds: 120,
    maxTeamMembers: 3,
    maxPagesPerAudit: 1500,
    maxRequestsPerAudit: 8000,
    maxAuditDepth: 6,
    auditEveryDays: 7,
    manualAuditsPerWeek: 3,
    maxAuditMinutes: 30,
    reportBranding: "standard",
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUsdMonthly: 199,
    priceUsdYearly: 1990,
    maxActiveSites: 150,
    uptimeIntervalSeconds: 60,
    maxTeamMembers: 10,
    maxPagesPerAudit: 3000,
    maxRequestsPerAudit: 15000,
    maxAuditDepth: 8,
    auditEveryDays: 7,
    manualAuditsPerWeek: 10,
    maxAuditMinutes: 45,
    reportBranding: "advanced",
  },
};

/** New workspaces start on a Growth trial (Onboarding copy: "14-day trial with full Growth features"). */
export const TRIAL_PLAN: PlanKey = "growth";
export const TRIAL_DAYS = 14;

export function isPlanKey(value: string): value is PlanKey {
  return Object.hasOwn(PLANS, value);
}

/** Unknown keys fall back to Starter so a bad value never grants more than the smallest plan. */
export function getPlan(key: string): Plan {
  return isPlanKey(key) ? PLANS[key] : PLANS.starter;
}

export const PLAN_ORDER: PlanKey[] = ["starter", "growth", "pro"];

export function isBillingInterval(value: string): value is BillingInterval {
  return (BILLING_INTERVALS as string[]).includes(value);
}

export function planPrice(plan: Plan, interval: BillingInterval): number {
  return interval === "year" ? plan.priceUsdYearly : plan.priceUsdMonthly;
}

/** Whole months saved by paying yearly (2 with today's prices). */
export function monthsFreeYearly(plan: Plan): number {
  return Math.round(12 - plan.priceUsdYearly / plan.priceUsdMonthly);
}

export function isLargestPlan(plan: Plan): boolean {
  return plan.key === PLAN_ORDER.at(-1);
}

/**
 * What to suggest when a workspace is out of website slots. There's no paid
 * add-on above the largest plan, so there it's a conversation with us.
 */
export function moreSitesHint(plan: Plan, supportEmail?: string): string {
  if (!isLargestPlan(plan)) return "upgrade your plan";
  return `contact us${supportEmail ? ` at ${supportEmail}` : ""} about more than ${plan.maxActiveSites} sites`;
}
