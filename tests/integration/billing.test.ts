import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { assertCanOperate } from "@/lib/billing/access";
import { processWebhookEvent } from "@/lib/billing/apply";
import { checkoutCustomData } from "@/lib/billing/checkout-token";
import type { BillingConfig } from "@/lib/billing/config";
import type { BillingProvider, PaddleSubscription, PaddleTransaction, WebhookEvent } from "@/lib/billing/paddle";
import { subscriptionEntity, transactionEntity } from "@/lib/billing/paddle";
import { changePlan, confirmCheckout, getBillingOverview, invoiceUrl, previewPlanChange } from "@/lib/data/billing";
import { requestManualCheck } from "@/lib/data/monitoring";
import { updateBranding } from "@/lib/data/reports";
import { createSite, listSites } from "@/lib/data/sites";
import { ForbiddenError, type TenantContext } from "@/lib/data/tenant";
import { requeueFailedJob } from "@/lib/jobs/queue";
import { scheduleDueWork } from "@/lib/monitoring/scheduler";
import { warnIfNearPlanLimit } from "@/lib/notify/usage";
import { normalizeSiteUrl } from "@/lib/url";
import { addMember, db, resetDb, workspaceWithOwner } from "./helpers";

// FR-BILL-01/05/06/08 and spec §13: webhook idempotency, out-of-order safety,
// grace rules, and server-side enforcement once a plan lapses.

const config: BillingConfig = {
  environment: "sandbox",
  apiKey: "test",
  webhookSecret: "test",
  clientToken: "test",
  prices: {
    month: { starter: "pri_starter", growth: "pri_growth", pro: "pri_pro" },
    year: { starter: "pri_starter_y", growth: "pri_growth_y", pro: "pri_pro_y" },
  },
};

const DAY = 24 * 60 * 60_000;

function subscriptionData(workspaceId: string, o: Record<string, unknown> = {}) {
  return {
    id: "sub_01",
    status: "active",
    customer_id: "ctm_01",
    items: [{ price: { id: "pri_pro" } }],
    current_billing_period: { starts_at: "2026-10-14T00:00:00Z", ends_at: "2026-11-14T00:00:00Z" },
    scheduled_change: null,
    custom_data: checkoutCustomData(workspaceId),
    paused_at: null,
    canceled_at: null,
    updated_at: "2026-10-14T00:00:00Z",
    ...o,
  };
}

function transactionData(workspaceId: string, o: Record<string, unknown> = {}) {
  return {
    id: "txn_01",
    status: "completed",
    customer_id: "ctm_01",
    subscription_id: "sub_01",
    invoice_number: "325-10001",
    custom_data: checkoutCustomData(workspaceId),
    currency_code: "USD",
    billed_at: "2026-10-14T00:00:00Z",
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:05Z",
    details: { totals: { grand_total: "14900" } },
    payments: [
      {
        status: "captured",
        method_details: { card: { type: "visa", last4: "4417", expiry_month: 3, expiry_year: 2028 } },
      },
    ],
    ...o,
  };
}

function event(type: string, data: unknown, id = `evt_${randomUUID()}`): WebhookEvent {
  return { event_id: id, event_type: type, occurred_at: new Date(), data };
}

const process = (e: WebhookEvent, now = new Date()) => processWebhookEvent(db, e, config, now);

async function addSite(ctx: TenantContext, host: string) {
  const u = normalizeSiteUrl(host);
  if (!u.ok) throw new Error(u.error);
  return createSite(db, ctx, { url: u.value });
}

function fakeProvider(overrides: Partial<BillingProvider> = {}): BillingProvider {
  const nope = () => Promise.reject(new Error("not stubbed"));
  return {
    getSubscription: nope,
    getTransaction: nope,
    previewPlanChange: nope,
    changePlan: nope,
    portalUrl: nope,
    invoiceUrl: nope,
    ...overrides,
  };
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("Paddle webhooks", () => {
  it("links a new subscription to the signed workspace and sets plan and open-ended access", async () => {
    const ctx = await workspaceWithOwner();
    expect(await process(event("subscription.created", subscriptionData(ctx.workspaceId)))).toBe("applied");
    const ws = await db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      include: { subscription: true },
    });
    expect(ws.planKey).toBe("pro");
    expect(ws.accessEndsAt).toBeNull();
    expect(ws.subscription).toMatchObject({
      providerSubscriptionId: "sub_01",
      status: "active",
      providerCustomerId: "ctm_01",
    });
    expect(
      await db.auditLog.count({ where: { workspaceId: ctx.workspaceId, action: "billing.subscription_changed" } }),
    ).toBe(1);
  });

  it("records the billing interval from the price, and follows a switch to yearly", async () => {
    const ctx = await workspaceWithOwner();
    await process(event("subscription.created", subscriptionData(ctx.workspaceId)));
    expect(await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspaceId } })).toMatchObject({
      planKey: "pro",
      billingInterval: "month",
    });

    const yearly = subscriptionData(ctx.workspaceId, {
      items: [{ price: { id: "pri_growth_y" } }],
      updated_at: "2026-10-15T00:00:00Z",
    });
    expect(await process(event("subscription.updated", yearly))).toBe("applied");
    expect(await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspaceId } })).toMatchObject({
      planKey: "growth",
      billingInterval: "year",
    });
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).planKey).toBe("growth");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ctx.workspaceId, action: "billing.subscription_changed" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({ planKey: "growth", interval: "year" });
  });

  it("acknowledges duplicate deliveries without applying them twice", async () => {
    const ctx = await workspaceWithOwner();
    const e = event("subscription.created", subscriptionData(ctx.workspaceId), "evt_same");
    expect(await process(e)).toBe("applied");
    expect(await process(e)).toBe("duplicate");
    const [a, b] = await Promise.all([
      process(event("subscription.updated", subscriptionData(ctx.workspaceId), "evt_race")),
      process(event("subscription.updated", subscriptionData(ctx.workspaceId), "evt_race")),
    ]);
    expect([a, b].sort()).toEqual(["applied", "duplicate"]);
    expect(await db.billingEvent.count()).toBe(2);
  });

  it("ignores an older entity that arrives after a newer one (out-of-order delivery)", async () => {
    const ctx = await workspaceWithOwner();
    await process(
      event("subscription.updated", subscriptionData(ctx.workspaceId, { updated_at: "2026-10-20T00:00:00Z" })),
    );
    const older = subscriptionData(ctx.workspaceId, {
      items: [{ price: { id: "pri_starter" } }],
      updated_at: "2026-10-19T00:00:00Z",
    });
    expect(await process(event("subscription.updated", older))).toBe("ignored");
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).planKey).toBe("pro");
  });

  it("keeps 14 days of access from the first failed payment and clears it on recovery", async () => {
    const ctx = await workspaceWithOwner();
    const first = new Date("2026-10-24T09:00:00Z");
    await process(event("subscription.created", subscriptionData(ctx.workspaceId)));
    await process(
      event(
        "subscription.past_due",
        subscriptionData(ctx.workspaceId, { status: "past_due", updated_at: "2026-10-24T09:00:00Z" }),
      ),
      first,
    );
    await process(
      event(
        "subscription.updated",
        subscriptionData(ctx.workspaceId, { status: "past_due", updated_at: "2026-10-28T09:00:00Z" }),
      ),
      new Date("2026-10-28T09:00:00Z"),
    );
    let ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, include: { subscription: true } });
    expect(ws.subscription!.pastDueSince).toEqual(first);
    expect(ws.accessEndsAt).toEqual(new Date(first.getTime() + 14 * DAY));
    await process(
      event("subscription.activated", subscriptionData(ctx.workspaceId, { updated_at: "2026-10-29T09:00:00Z" })),
    );
    ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, include: { subscription: true } });
    expect(ws.accessEndsAt).toBeNull();
    expect(ws.subscription!.pastDueSince).toBeNull();
  });

  it("after cancellation: monitoring stops, new work is refused, data stays readable", async () => {
    const ctx = await workspaceWithOwner();
    const site = await addSite(ctx, "harbourdental.co.uk");
    await db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { trialEndsAt: new Date("2026-10-01T00:00:00Z") },
    });
    await process(event("subscription.created", subscriptionData(ctx.workspaceId)));
    const canceledAt = new Date(Date.now() - 60_000).toISOString();
    await process(
      event(
        "subscription.canceled",
        subscriptionData(ctx.workspaceId, { status: "canceled", canceled_at: canceledAt, updated_at: canceledAt }),
      ),
    );
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    expect(ws.accessEndsAt).toEqual(new Date(canceledAt));

    const now = new Date();
    await scheduleDueWork(db, now);
    expect(await db.job.count({ where: { resourceId: site.id, jobType: "uptime_check" } })).toBe(0);
    await expect(addSite(ctx, "another-site.co.uk")).rejects.toMatchObject({ code: "billing" });
    await expect(requestManualCheck(db, ctx, site.id)).rejects.toMatchObject({ code: "billing" });
    await expect(assertCanOperate(db, ctx)).rejects.toMatchObject({ code: "billing" });
    const listed = await listSites(db, ctx, {});
    expect(JSON.stringify(listed)).toContain("harbourdental.co.uk");
  });

  it("ignores forged custom data and prices that aren't ours", async () => {
    const ctx = await workspaceWithOwner();
    const forged = subscriptionData(ctx.workspaceId, {
      custom_data: { workspace_id: ctx.workspaceId, workspace_sig: "forged" },
    });
    expect(await process(event("subscription.created", forged))).toBe("ignored");
    expect(
      await process(
        event(
          "subscription.created",
          subscriptionData(ctx.workspaceId, { items: [{ price: { id: "pri_other_app" } }] }),
        ),
      ),
    ).toBe("ignored");
    expect(await db.subscription.count()).toBe(0);
  });

  it("never lets a second live subscription displace the first", async () => {
    const ctx = await workspaceWithOwner();
    await process(event("subscription.created", subscriptionData(ctx.workspaceId)));
    const second = subscriptionData(ctx.workspaceId, { id: "sub_02", items: [{ price: { id: "pri_starter" } }] });
    expect(await process(event("subscription.created", second))).toBe("ignored");
    const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspaceId } });
    expect(sub.providerSubscriptionId).toBe("sub_01");
  });

  it("stores invoices with the card used, and flags failed payments", async () => {
    const ctx = await workspaceWithOwner();
    await process(event("subscription.created", subscriptionData(ctx.workspaceId)));
    await process(event("transaction.completed", transactionData(ctx.workspaceId)));
    await process(
      event(
        "transaction.payment_failed",
        transactionData(ctx.workspaceId, {
          id: "txn_02",
          invoice_number: null,
          billed_at: "2026-11-14T00:00:00Z",
          updated_at: "2026-11-14T00:00:00Z",
        }),
      ),
    );
    const overview = await getBillingOverview(db, ctx);
    expect(overview.transactions.map((t) => [t.id, t.status])).toEqual([
      ["txn_02", "failed"],
      ["txn_01", "completed"],
    ]);
    expect(overview.card).toMatchObject({ brand: "visa", last4: "4417", expiry: "03/2028", failed: true });
  });
});

describe("billing actions", () => {
  async function subscribed(planPrice = "pri_growth") {
    const ctx = await workspaceWithOwner();
    await process(
      event("subscription.created", subscriptionData(ctx.workspaceId, { items: [{ price: { id: planPrice } }] })),
    );
    return ctx;
  }

  it("blocks downgrades that can't hold the active websites, and applies upgrades straight away", async () => {
    const ctx = await subscribed("pri_growth");
    await db.workspace.update({ where: { id: ctx.workspaceId }, data: { planKey: "growth" } });
    for (let i = 0; i < 16; i++) await addSite(ctx, `site-${i}.example.com`);
    const provider = fakeProvider({
      previewPlanChange: async () => ({ action: "charge", amount: 2500, currency: "USD", creditUsed: 0, dueNow: 2500 }),
      changePlan: async (_id, priceId) =>
        subscriptionEntity.parse(
          subscriptionData(ctx.workspaceId, {
            items: [{ price: { id: priceId } }],
            updated_at: new Date().toISOString(),
          }),
        ),
    });
    await expect(previewPlanChange(db, ctx, provider, config, "starter")).rejects.toMatchObject({ code: "plan_limit" });
    await expect(changePlan(db, ctx, provider, config, "starter")).rejects.toThrow(/Pause 1 website/);
    expect(await previewPlanChange(db, ctx, provider, config, "pro")).toEqual({
      action: "charge",
      amount: 2500,
      currency: "USD",
      creditUsed: 0,
      dueNow: 2500,
    });
    await changePlan(db, ctx, provider, config, "pro");
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).planKey).toBe("pro");
  });

  it("keeps the billing interval on a plan change unless the owner switches it", async () => {
    const ctx = await subscribed("pri_growth_y");
    const requested: string[] = [];
    const provider = fakeProvider({
      previewPlanChange: async (_id, priceId) => {
        requested.push(priceId);
        return { action: "charge", amount: 1, currency: "USD", creditUsed: 0, dueNow: 1 };
      },
      changePlan: async (_id, priceId) => {
        requested.push(priceId);
        return subscriptionEntity.parse(
          subscriptionData(ctx.workspaceId, {
            items: [{ price: { id: priceId } }],
            updated_at: new Date().toISOString(),
          }),
        );
      },
    });
    await previewPlanChange(db, ctx, provider, config, "pro");
    await changePlan(db, ctx, provider, config, "pro");
    expect(requested).toEqual(["pri_pro_y", "pri_pro_y"]);
    expect(await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspaceId } })).toMatchObject({
      planKey: "pro",
      billingInterval: "year",
    });

    // Same plan, other interval: a billing-period switch. Same plan and interval: nothing to do.
    await changePlan(db, ctx, provider, config, "pro", "month");
    expect(requested.at(-1)).toBe("pri_pro");
    await expect(previewPlanChange(db, ctx, provider, config, "pro", "month")).rejects.toThrow(/already on Pro/);

    // Without yearly prices configured, switching to yearly is refused before reaching Paddle.
    const monthlyOnly = { ...config, prices: { ...config.prices, year: null } };
    await expect(changePlan(db, ctx, provider, monthlyOnly, "growth", "year")).rejects.toThrow(/Yearly billing/);
    expect(requested).toHaveLength(3);
  });

  it("only owners manage billing", async () => {
    const owner = await subscribed();
    const admin = await addMember(owner, "admin");
    await expect(changePlan(db, admin, fakeProvider(), config, "pro")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewPlanChange(db, admin, fakeProvider(), config, "pro")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("confirms a checkout only for the workspace that started it", async () => {
    const a = await workspaceWithOwner("Alpha");
    const b = await workspaceWithOwner("Bravo");
    const provider = fakeProvider({
      getTransaction: async () => transactionEntity.parse(transactionData(b.workspaceId)) as PaddleTransaction,
      getSubscription: async () => subscriptionEntity.parse(subscriptionData(b.workspaceId)) as PaddleSubscription,
    });
    await expect(confirmCheckout(db, a, provider, config, "txn_01")).rejects.toMatchObject({ code: "not_found" });
    await expect(confirmCheckout(db, b, provider, config, "txn_01")).resolves.toEqual({ applied: true });
    expect((await db.workspace.findUniqueOrThrow({ where: { id: b.workspaceId } })).planKey).toBe("pro");
    expect(await db.subscription.count({ where: { workspaceId: a.workspaceId } })).toBe(0);
  });

  it("never opens another workspace's invoice", async () => {
    const a = await subscribed();
    const b = await workspaceWithOwner("Bravo");
    await process(event("transaction.completed", transactionData(a.workspaceId)));
    const provider = fakeProvider({ invoiceUrl: async () => "https://paddle.example/invoice.pdf" });
    await expect(invoiceUrl(db, b, provider, "txn_01")).rejects.toMatchObject({ code: "not_found" });
    await expect(invoiceUrl(db, a, provider, "txn_01")).resolves.toContain("invoice.pdf");
  });
});

describe("costly features follow the plan", () => {
  it("emails owners once per plan and month when websites reach 90% of the plan", async () => {
    const ctx = await workspaceWithOwner("Owner", "starter");
    // Starter holds 15: the warning goes out at 14 (90%, rounded up).
    for (let i = 0; i < 13; i++) await addSite(ctx, `client-${i}.example.com`);
    expect(await warnIfNearPlanLimit(db, ctx.workspaceId)).toBe(0);
    await addSite(ctx, "client-13.example.com");
    expect(await warnIfNearPlanLimit(db, ctx.workspaceId)).toBe(1);
    expect(await warnIfNearPlanLimit(db, ctx.workspaceId)).toBe(0);
    const mail = await db.emailDelivery.findFirstOrThrow({ where: { templateType: "plan_usage" } });
    expect(mail.subject).toMatch(/14 of 15 websites on Starter/);
  });

  it("keeps the custom report footer for Growth and Pro", async () => {
    const starter = await workspaceWithOwner("Starter", "starter");
    const growth = await workspaceWithOwner("Growth", "growth");
    const input = { name: "Agency", color: null, contact: null, footer: "hello@agency.com" };
    await expect(updateBranding(db, starter, input)).rejects.toMatchObject({ code: "plan_limit", field: "footer" });
    await expect(updateBranding(db, growth, input)).resolves.toBeUndefined();
    // Saving other fields on Starter doesn't trip over an existing footer kept from a bigger plan.
    await db.workspace.update({ where: { id: starter.workspaceId }, data: { reportFooter: "kept" } });
    await expect(updateBranding(db, starter, { ...input, footer: "kept", name: "Renamed" })).resolves.toBeUndefined();
  });
});

describe("failed job requeue (FR-OPS-04)", () => {
  it("retries a failed job once, resets its email, and refuses duplicates", async () => {
    const ctx = await workspaceWithOwner();
    const delivery = await db.emailDelivery.create({
      data: {
        workspaceId: ctx.workspaceId,
        recipient: "a@example.com",
        templateType: "incident_opened",
        deduplicationKey: "k1",
        subject: "s",
        textBody: "t",
        htmlBody: "h",
        status: "failed",
      },
    });
    const job = await db.job.create({
      data: {
        jobType: "email_send",
        resourceType: "email",
        resourceId: delivery.id,
        status: "failed",
        attempts: 5,
        completedAt: new Date(),
      },
    });
    expect(await requeueFailedJob(db, job.id)).toBe("requeued");
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "pending", attempts: 0 });
    expect((await db.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("pending");
    expect(await requeueFailedJob(db, job.id)).toBe("not_failed");

    const other = await db.job.create({
      data: {
        jobType: "email_send",
        resourceType: "email",
        resourceId: delivery.id,
        status: "failed",
        completedAt: new Date(),
      },
    });
    expect(await requeueFailedJob(db, other.id)).toBe("busy");
  });
});
