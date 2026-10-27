// Plan configuration (FR-BILL-02). The single source for prices and limits —
// UI and server enforcement both read from here. Values are the spec §5
// hypotheses and must stay changeable without schema changes.

export type PlanKey = "starter" | "growth" | "pro";

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsdMonthly: number;
  maxActiveSites: number;
  uptimeIntervalSeconds: number;
  maxTeamMembers: number;
  /** Starter's 500 is from spec §10.4; Growth/Pro are placeholders until load testing. */
  maxPagesPerAudit: number;
  /** Total requests per audit (pages + link checks + robots/sitemap). */
  maxRequestsPerAudit: number;
  maxAuditDepth: number;
  /** Scheduled audits run every N days (spec: weekly on Starter, more frequent but bounded above). */
  auditEveryDays: number;
  manualAuditsPerWeek: number;
  /** Wall-clock cap per audit; crawling is paced (~1 page/s), so this bounds coverage too. */
  maxAuditMinutes: number;
};

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    priceUsdMonthly: 49,
    maxActiveSites: 25,
    uptimeIntervalSeconds: 300,
    maxTeamMembers: 1,
    maxPagesPerAudit: 500,
    maxRequestsPerAudit: 3000,
    maxAuditDepth: 5,
    auditEveryDays: 7,
    manualAuditsPerWeek: 1,
    maxAuditMinutes: 15,
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceUsdMonthly: 99,
    maxActiveSites: 100,
    uptimeIntervalSeconds: 120,
    maxTeamMembers: 3,
    maxPagesPerAudit: 1500,
    maxRequestsPerAudit: 8000,
    maxAuditDepth: 6,
    auditEveryDays: 7,
    manualAuditsPerWeek: 3,
    maxAuditMinutes: 30,
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUsdMonthly: 149,
    maxActiveSites: 300,
    uptimeIntervalSeconds: 60,
    maxTeamMembers: 10,
    maxPagesPerAudit: 3000,
    maxRequestsPerAudit: 15000,
    maxAuditDepth: 8,
    auditEveryDays: 3,
    manualAuditsPerWeek: 10,
    maxAuditMinutes: 45,
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
