import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { BillingConfig } from "@/lib/billing/config";

// Small Paddle Billing client: webhook signature verification, the entity
// fields we use (validated with zod, snake_case as Paddle sends them), and the
// handful of API calls the app makes. Kept dependency-free so tests can sign
// real payloads and swap the HTTP layer.

// ─── Webhook signatures ───────────────────────────────────────────────────

/** Paddle signs `${ts}:${rawBody}` with HMAC-SHA256; the header is `ts=…;h1=…` (several h1 during secret rotation). */
export function signPayload(rawBody: string, secret: string, ts: number): string {
  return createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
}

const MAX_SIGNATURE_AGE_S = 5 * 60;

export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature" };
  const parts = header.split(";").map((p) => p.split("=", 2) as [string, string | undefined]);
  const ts = Number(parts.find(([k]) => k === "ts")?.[1]);
  const sigs = parts.filter(([k, v]) => k === "h1" && v).map(([, v]) => v!);
  if (!Number.isInteger(ts) || sigs.length === 0) return { ok: false, reason: "malformed signature" };
  // Replays of an old, valid request are rejected here; duplicates inside the window are deduped by event id.
  if (Math.abs(now / 1000 - ts) > MAX_SIGNATURE_AGE_S) return { ok: false, reason: "stale signature" };
  const expected = Buffer.from(signPayload(rawBody, secret, ts), "hex");
  const match = sigs.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

// ─── Entities ─────────────────────────────────────────────────────────────

const datetime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const customData = z.record(z.string(), z.unknown()).nullish();

export const subscriptionEntity = z.object({
  id: z.string(),
  status: z.enum(["trialing", "active", "past_due", "paused", "canceled"]),
  customer_id: z.string(),
  items: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1),
  current_billing_period: z.object({ starts_at: datetime, ends_at: datetime }).nullish(),
  scheduled_change: z.object({ action: z.enum(["cancel", "pause", "resume"]), effective_at: datetime }).nullish(),
  custom_data: customData,
  paused_at: datetime.nullish(),
  canceled_at: datetime.nullish(),
  updated_at: datetime,
});
export type PaddleSubscription = z.infer<typeof subscriptionEntity>;

export const transactionEntity = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullish(),
  subscription_id: z.string().nullish(),
  invoice_number: z.string().nullish(),
  custom_data: customData,
  currency_code: z.string(),
  billed_at: datetime.nullish(),
  created_at: datetime,
  updated_at: datetime,
  details: z.object({ totals: z.object({ grand_total: z.string() }) }),
  payments: z
    .array(
      z.object({
        status: z.string().optional(),
        method_details: z
          .object({
            card: z
              .object({
                type: z.string().nullish(),
                last4: z.string().nullish(),
                expiry_month: z.number().nullish(),
                expiry_year: z.number().nullish(),
              })
              .nullish(),
          })
          .nullish(),
      }),
    )
    .default([]),
});
export type PaddleTransaction = z.infer<typeof transactionEntity>;

export const webhookEvent = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  occurred_at: datetime,
  data: z.unknown(),
});
export type WebhookEvent = z.infer<typeof webhookEvent>;

// ─── API ──────────────────────────────────────────────────────────────────

export class PaddleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PaddleApiError";
  }
}

export type PlanChangePreview = { action: "charge" | "credit" | "none"; amount: number; currency: string };

/** The Paddle calls the app makes. An interface so tests can supply a fake. */
export interface BillingProvider {
  getSubscription(id: string): Promise<PaddleSubscription>;
  getTransaction(id: string): Promise<PaddleTransaction>;
  previewPlanChange(subscriptionId: string, priceId: string): Promise<PlanChangePreview>;
  changePlan(subscriptionId: string, priceId: string): Promise<PaddleSubscription>;
  portalUrl(customerId: string, subscriptionId: string | null): Promise<string>;
  invoiceUrl(transactionId: string): Promise<string>;
}

type Fetch = typeof fetch;

export function paddleApi(config: BillingConfig, fetchImpl: Fetch = fetch): BillingProvider {
  const base = config.environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: unknown;
      error?: { code?: string; detail?: string };
    } | null;
    if (!res.ok) {
      throw new PaddleApiError(res.status, json?.error?.code ?? "unknown", json?.error?.detail ?? `HTTP ${res.status}`);
    }
    return json?.data;
  }

  const proration = { proration_billing_mode: "prorated_immediately" } as const;

  return {
    async getSubscription(id) {
      return subscriptionEntity.parse(await call("GET", `/subscriptions/${encodeURIComponent(id)}`));
    },
    async getTransaction(id) {
      return transactionEntity.parse(await call("GET", `/transactions/${encodeURIComponent(id)}`));
    },
    async previewPlanChange(subscriptionId, priceId) {
      const data = z
        .object({
          update_summary: z
            .object({
              result: z.object({
                action: z.enum(["charge", "credit"]),
                amount: z.string(),
                currency_code: z.string(),
              }),
            })
            .nullish(),
          currency_code: z.string(),
        })
        .parse(
          await call("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}/preview`, {
            items: [{ price_id: priceId, quantity: 1 }],
            ...proration,
          }),
        );
      const result = data.update_summary?.result;
      if (!result) return { action: "none", amount: 0, currency: data.currency_code };
      return { action: result.action, amount: Number(result.amount), currency: result.currency_code };
    },
    async changePlan(subscriptionId, priceId) {
      return subscriptionEntity.parse(
        await call("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          items: [{ price_id: priceId, quantity: 1 }],
          ...proration,
          on_payment_failure: "prevent_change",
        }),
      );
    },
    async portalUrl(customerId, subscriptionId) {
      const data = z.object({ urls: z.object({ general: z.object({ overview: z.string() }) }) }).parse(
        await call("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
          subscription_ids: subscriptionId ? [subscriptionId] : [],
        }),
      );
      return data.urls.general.overview;
    },
    async invoiceUrl(transactionId) {
      const data = z
        .object({ url: z.string() })
        .parse(await call("GET", `/transactions/${encodeURIComponent(transactionId)}/invoice`));
      return data.url;
    },
  };
}
