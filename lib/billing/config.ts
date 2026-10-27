import { env, type Env } from "@/lib/env";
import type { PlanKey } from "@/lib/plans";

// Paddle configuration. Plans (prices, limits) live in lib/plans.ts; this only
// maps each plan to its Paddle price id, which differs between sandbox and
// production, so it comes from the environment.

export type BillingConfig = {
  environment: "sandbox" | "production";
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  prices: Record<PlanKey, string>;
};

/** Days a past-due workspace keeps full access after the first failed payment (FR-BILL-05). */
export const PAST_DUE_GRACE_DAYS = 14;

export function parseBillingConfig(e: Env): BillingConfig | null {
  const { PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_CLIENT_TOKEN } = e;
  const { PADDLE_PRICE_STARTER, PADDLE_PRICE_GROWTH, PADDLE_PRICE_PRO } = e;
  if (!PADDLE_API_KEY || !PADDLE_WEBHOOK_SECRET || !PADDLE_CLIENT_TOKEN) return null;
  if (!PADDLE_PRICE_STARTER || !PADDLE_PRICE_GROWTH || !PADDLE_PRICE_PRO) return null;
  return {
    environment: e.PADDLE_ENVIRONMENT,
    apiKey: PADDLE_API_KEY,
    webhookSecret: PADDLE_WEBHOOK_SECRET,
    clientToken: PADDLE_CLIENT_TOKEN,
    prices: { starter: PADDLE_PRICE_STARTER, growth: PADDLE_PRICE_GROWTH, pro: PADDLE_PRICE_PRO },
  };
}

/** Null when billing isn't configured (local development without Paddle keys). */
export function billingConfig(): BillingConfig | null {
  return parseBillingConfig(env());
}

/** The plan a Paddle price id stands for, or null for prices that aren't ours. */
export function planForPrice(config: BillingConfig, priceId: string): PlanKey | null {
  for (const [plan, id] of Object.entries(config.prices) as [PlanKey, string][]) if (id === priceId) return plan;
  return null;
}
