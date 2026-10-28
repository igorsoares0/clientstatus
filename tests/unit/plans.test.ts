import { describe, expect, it } from "vitest";
import {
  getPlan,
  isLargestPlan,
  isPlanKey,
  monthsFreeYearly,
  moreSitesHint,
  PLANS,
  planPrice,
  TRIAL_DAYS,
  TRIAL_PLAN,
} from "@/lib/plans";

describe("plans", () => {
  it("matches the spec §5 prices and limits", () => {
    expect(PLANS.starter).toMatchObject({
      priceUsdMonthly: 49,
      priceUsdYearly: 490,
      maxActiveSites: 15,
      uptimeIntervalSeconds: 300,
      auditEveryDays: 7,
      maxTeamMembers: 1,
    });
    expect(PLANS.growth).toMatchObject({
      priceUsdMonthly: 99,
      priceUsdYearly: 990,
      maxActiveSites: 50,
      uptimeIntervalSeconds: 120,
      auditEveryDays: 7,
      maxTeamMembers: 3,
    });
    expect(PLANS.pro).toMatchObject({
      priceUsdMonthly: 199,
      priceUsdYearly: 1990,
      maxActiveSites: 150,
      uptimeIntervalSeconds: 60,
      auditEveryDays: 7,
      maxTeamMembers: 10,
    });
  });

  it("prices yearly at two months free on every plan", () => {
    for (const plan of Object.values(PLANS)) {
      expect(monthsFreeYearly(plan)).toBe(2);
      expect(planPrice(plan, "month")).toBe(plan.priceUsdMonthly);
      expect(planPrice(plan, "year")).toBe(plan.priceUsdYearly);
    }
  });

  it("starts 14-day trials on Growth", () => {
    expect(TRIAL_PLAN).toBe("growth");
    expect(TRIAL_DAYS).toBe(14);
  });

  it("suggests an upgrade below Pro and contacting us on Pro", () => {
    expect(isLargestPlan(PLANS.pro)).toBe(true);
    expect(moreSitesHint(PLANS.growth)).toBe("upgrade your plan");
    expect(moreSitesHint(PLANS.pro)).toBe("contact us about more than 150 sites");
    expect(moreSitesHint(PLANS.pro, "hello@clientstatus.app")).toBe(
      "contact us at hello@clientstatus.app about more than 150 sites",
    );
  });

  it("falls back to the smallest plan for unknown keys", () => {
    expect(isPlanKey("enterprise")).toBe(false);
    expect(isPlanKey("toString")).toBe(false);
    expect(getPlan("enterprise").key).toBe("starter");
  });
});
