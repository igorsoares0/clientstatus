import { describe, expect, it } from "vitest";
import { getPlan, isPlanKey, PLANS, TRIAL_PLAN } from "@/lib/plans";

describe("plans", () => {
  it("matches the spec §5 price and limit hypotheses", () => {
    expect(PLANS.starter).toMatchObject({
      priceUsdMonthly: 49,
      maxActiveSites: 25,
      uptimeIntervalSeconds: 300,
      maxTeamMembers: 1,
    });
    expect(PLANS.growth).toMatchObject({
      priceUsdMonthly: 99,
      maxActiveSites: 100,
      uptimeIntervalSeconds: 120,
      maxTeamMembers: 3,
    });
    expect(PLANS.pro).toMatchObject({
      priceUsdMonthly: 149,
      maxActiveSites: 300,
      uptimeIntervalSeconds: 60,
      maxTeamMembers: 10,
    });
  });

  it("starts trials on Growth", () => {
    expect(TRIAL_PLAN).toBe("growth");
  });

  it("falls back to the smallest plan for unknown keys", () => {
    expect(isPlanKey("enterprise")).toBe(false);
    expect(isPlanKey("toString")).toBe(false);
    expect(getPlan("enterprise").key).toBe("starter");
  });
});
