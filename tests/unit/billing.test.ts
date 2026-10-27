import { describe, expect, it } from "vitest";
import { billingState, computeAccess, hasAccess, type SubscriptionFacts } from "@/lib/billing/access";
import { checkoutCustomData, workspaceFromCustomData } from "@/lib/billing/checkout-token";
import { parseBillingConfig, planForPrice } from "@/lib/billing/config";
import { signPayload, verifySignature, webhookEvent } from "@/lib/billing/paddle";
import { parseEnv } from "@/lib/env";

const SECRET = "pdl_ntfset_test_secret";
const DAY = 24 * 60 * 60_000;

function header(body: string, ts: number, secret = SECRET) {
  return `ts=${ts};h1=${signPayload(body, secret, ts)}`;
}

describe("Paddle webhook signatures", () => {
  const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" });
  const now = 1_790_000_000_000;
  const ts = Math.floor(now / 1000);

  it("accepts a correctly signed, fresh payload", () => {
    expect(verifySignature(body, header(body, ts), SECRET, now)).toEqual({ ok: true });
  });

  it("rejects tampered bodies, wrong secrets and missing or malformed headers", () => {
    expect(verifySignature(body + " ", header(body, ts), SECRET, now)).toMatchObject({ ok: false });
    expect(verifySignature(body, header(body, ts, "other"), SECRET, now)).toMatchObject({ ok: false });
    expect(verifySignature(body, null, SECRET, now)).toMatchObject({ ok: false, reason: "missing signature" });
    expect(verifySignature(body, "garbage", SECRET, now)).toMatchObject({ ok: false, reason: "malformed signature" });
    expect(verifySignature(body, `ts=${ts};h1=zz`, SECRET, now)).toMatchObject({ ok: false });
  });

  it("rejects replays of old signatures", () => {
    expect(verifySignature(body, header(body, ts - 301), SECRET, now)).toMatchObject({
      ok: false,
      reason: "stale signature",
    });
    expect(verifySignature(body, header(body, ts - 299), SECRET, now)).toEqual({ ok: true });
  });

  it("accepts any of several h1 values (secret rotation)", () => {
    const h = `ts=${ts};h1=${signPayload(body, "old", ts)};h1=${signPayload(body, SECRET, ts)}`;
    expect(verifySignature(body, h, SECRET, now)).toEqual({ ok: true });
  });

  it("parses the event envelope", () => {
    const e = webhookEvent.parse({
      event_id: "evt_1",
      event_type: "subscription.updated",
      occurred_at: "2026-10-27T10:00:00.000000Z",
      data: {},
    });
    expect(e.occurred_at.toISOString()).toBe("2026-10-27T10:00:00.000Z");
  });
});

describe("checkout custom data", () => {
  it("round-trips a signed workspace id and rejects forgeries", () => {
    const data = checkoutCustomData("ws-1", "s3cret");
    expect(workspaceFromCustomData(data, "s3cret")).toBe("ws-1");
    expect(workspaceFromCustomData({ ...data, workspace_id: "ws-2" }, "s3cret")).toBeNull();
    expect(workspaceFromCustomData(data, "other-secret")).toBeNull();
    expect(workspaceFromCustomData({ workspace_id: "ws-1" }, "s3cret")).toBeNull();
    expect(workspaceFromCustomData(null, "s3cret")).toBeNull();
  });
});

describe("billing config", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5435/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    EMAIL_FROM: "a <a@b.co>",
  };
  it("is null until every Paddle value is present", () => {
    expect(parseBillingConfig(parseEnv(base))).toBeNull();
    expect(parseBillingConfig(parseEnv({ ...base, PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "s" }))).toBeNull();
  });
  it("maps prices to plans and ignores foreign prices", () => {
    const config = parseBillingConfig(
      parseEnv({
        ...base,
        PADDLE_API_KEY: "k",
        PADDLE_WEBHOOK_SECRET: "s",
        PADDLE_CLIENT_TOKEN: "t",
        PADDLE_PRICE_STARTER: "pri_a",
        PADDLE_PRICE_GROWTH: "pri_b",
        PADDLE_PRICE_PRO: "pri_c",
      }),
    )!;
    expect(config.environment).toBe("sandbox");
    expect(planForPrice(config, "pri_b")).toBe("growth");
    expect(planForPrice(config, "pri_someone_else")).toBeNull();
  });
});

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    planKey: "growth",
    status: "active",
    scheduledChange: null,
    scheduledChangeAt: null,
    pastDueSince: null,
    canceledAt: null,
    pausedAt: null,
    providerUpdatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

describe("grace and downgrade rules", () => {
  const trialEnds = new Date("2026-10-15T00:00:00Z");

  it("runs a trial to its end, then stops", () => {
    expect(computeAccess(trialEnds, null)).toEqual({ planKey: "growth", accessEndsAt: trialEnds });
    expect(hasAccess(trialEnds, new Date("2026-10-14T23:59:00Z"))).toBe(true);
    expect(hasAccess(trialEnds, new Date("2026-10-15T00:00:00Z"))).toBe(false);
    expect(hasAccess(null)).toBe(true);
  });

  it("gives an active subscription open-ended access on its plan", () => {
    expect(computeAccess(trialEnds, sub({ planKey: "pro" }))).toEqual({ planKey: "pro", accessEndsAt: null });
  });

  it("keeps access until a scheduled cancellation takes effect", () => {
    const at = new Date("2026-11-14T00:00:00Z");
    expect(computeAccess(trialEnds, sub({ scheduledChange: "cancel", scheduledChangeAt: at })).accessEndsAt).toEqual(
      at,
    );
  });

  it("allows 14 days from the first failed payment", () => {
    const since = new Date("2026-10-24T00:00:00Z");
    expect(computeAccess(null, sub({ status: "past_due", pastDueSince: since })).accessEndsAt).toEqual(
      new Date(since.getTime() + 14 * DAY),
    );
  });

  it("ends access at cancellation, but honours unused trial days", () => {
    const canceledAt = new Date("2026-10-05T00:00:00Z");
    expect(computeAccess(trialEnds, sub({ status: "canceled", canceledAt })).accessEndsAt).toEqual(trialEnds);
    expect(computeAccess(null, sub({ status: "canceled", canceledAt })).accessEndsAt).toEqual(canceledAt);
  });

  it("never grants more than Starter for an unknown plan key", () => {
    expect(computeAccess(null, sub({ planKey: "enterprise" })).planKey).toBe("starter");
  });

  it("describes each state for the Billing page", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(billingState({ trialEndsAt: trialEnds, accessEndsAt: trialEnds }, null, now)).toMatchObject({
      kind: "lapsed",
      reason: "trial_ended",
    });
    const active = { ...sub(), currentPeriodEnd: new Date("2026-11-14T00:00:00Z") };
    expect(billingState({ trialEndsAt: null, accessEndsAt: null }, active, now)).toMatchObject({ kind: "active" });
    const graceEnd = new Date("2026-11-07T00:00:00Z");
    expect(billingState({ trialEndsAt: null, accessEndsAt: graceEnd }, { ...active, status: "past_due" }, now)).toEqual(
      { kind: "past_due", graceEndsAt: graceEnd },
    );
    expect(
      billingState(
        { trialEndsAt: null, accessEndsAt: new Date("2026-10-26T00:00:00Z") },
        { ...active, status: "past_due" },
        now,
      ),
    ).toMatchObject({ kind: "lapsed", reason: "payment_failed" });
    expect(
      billingState(
        { trialEndsAt: null, accessEndsAt: new Date("2026-11-14T00:00:00Z") },
        { ...active, scheduledChange: "cancel" },
        now,
      ),
    ).toMatchObject({ kind: "canceling" });
  });
});
