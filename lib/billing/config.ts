import { env, type Env } from "@/lib/env";
import type { BillingInterval, PlanKey } from "@/lib/plans";

// Paddle configuration. Plans (prices, limits) live in lib/plans.ts; this only
// maps each plan and billing interval to its Paddle price id, which differs
// between sandbox and production, so it comes from the environment.

export type BillingConfig = {
  environment: "sandbox" | "production";
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  /** Yearly is null until its three prices are configured; checkout then offers monthly only. */
  prices: { month: Record<PlanKey, string>; year: Record<PlanKey, string> | null };
};

/** Days a past-due workspace keeps full access after the first failed payment (FR-BILL-05). */
export const PAST_DUE_GRACE_DAYS = 14;

export function parseBillingConfig(e: Env): BillingConfig | null {
  const { PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_CLIENT_TOKEN } = e;
  const { PADDLE_PRICE_STARTER, PADDLE_PRICE_GROWTH, PADDLE_PRICE_PRO } = e;
  const { PADDLE_PRICE_STARTER_YEARLY, PADDLE_PRICE_GROWTH_YEARLY, PADDLE_PRICE_PRO_YEARLY } = e;
  if (!PADDLE_API_KEY || !PADDLE_WEBHOOK_SECRET || !PADDLE_CLIENT_TOKEN) return null;
  if (!PADDLE_PRICE_STARTER || !PADDLE_PRICE_GROWTH || !PADDLE_PRICE_PRO) return null;
  // The env schema guarantees the yearly prices come as a set.
  const year =
    PADDLE_PRICE_STARTER_YEARLY && PADDLE_PRICE_GROWTH_YEARLY && PADDLE_PRICE_PRO_YEARLY
      ? { starter: PADDLE_PRICE_STARTER_YEARLY, growth: PADDLE_PRICE_GROWTH_YEARLY, pro: PADDLE_PRICE_PRO_YEARLY }
      : null;
  return {
    environment: e.PADDLE_ENVIRONMENT,
    apiKey: PADDLE_API_KEY,
    webhookSecret: PADDLE_WEBHOOK_SECRET,
    clientToken: PADDLE_CLIENT_TOKEN,
    prices: { month: { starter: PADDLE_PRICE_STARTER, growth: PADDLE_PRICE_GROWTH, pro: PADDLE_PRICE_PRO }, year },
  };
}

/** Null when billing isn't configured (local development without Paddle keys). */
export function billingConfig(): BillingConfig | null {
  return parseBillingConfig(env());
}

/** The Paddle price id for a plan and interval, or null when that interval isn't sold. */
export function priceFor(config: BillingConfig, planKey: PlanKey, interval: BillingInterval): string | null {
  return config.prices[interval]?.[planKey] ?? null;
}

/** The plan and billing interval a Paddle price id stands for, or null for prices that aren't ours. */
export function planForPrice(
  config: BillingConfig,
  priceId: string,
): { planKey: PlanKey; interval: BillingInterval } | null {
  for (const interval of ["month", "year"] as const) {
    const prices = config.prices[interval];
    if (!prices) continue;
    for (const [planKey, id] of Object.entries(prices) as [PlanKey, string][]) {
      if (id === priceId) return { planKey, interval };
    }
  }
  return null;
}
