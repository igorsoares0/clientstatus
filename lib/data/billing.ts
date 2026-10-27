import type { PrismaClient } from "@/lib/generated/prisma/client";
import { billingState } from "@/lib/billing/access";
import { applySubscription, applyTransaction } from "@/lib/billing/apply";
import { checkoutCustomData, workspaceFromCustomData, type CheckoutCustomData } from "@/lib/billing/checkout-token";
import type { BillingConfig } from "@/lib/billing/config";
import type { BillingProvider, PlanChangePreview } from "@/lib/billing/paddle";
import { UserFacingError, notFound } from "@/lib/data/errors";
import { assertRole, type TenantContext } from "@/lib/data/tenant";
import { PLANS, type PlanKey } from "@/lib/plans";

// Billing reads and owner-only actions. Plan changes, cancellation and payment
// methods are Paddle's: we start checkout, preview/apply plan switches and
// open the customer portal; state always comes back through lib/billing/apply.

export async function getBillingOverview(db: PrismaClient, ctx: TenantContext, now = new Date()) {
  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: {
      planKey: true,
      trialEndsAt: true,
      accessEndsAt: true,
      subscription: true,
      billingTransactions: { orderBy: { billedAt: "desc" }, take: 12 },
    },
  });
  const latestCard = ws.billingTransactions.find((t) => t.cardLast4);
  return {
    planKey: ws.planKey,
    subscription: ws.subscription,
    state: billingState(ws, ws.subscription, now),
    transactions: ws.billingTransactions,
    card: latestCard
      ? {
          brand: latestCard.cardBrand,
          last4: latestCard.cardLast4!,
          expiry: latestCard.cardExpiry,
          failed: ws.billingTransactions[0]?.status === "failed",
        }
      : null,
  };
}

/** What the browser needs to open Paddle checkout. Only when there's no live subscription. */
export async function checkoutOptions(
  db: PrismaClient,
  ctx: TenantContext & { email: string },
  config: BillingConfig,
): Promise<{ customData: CheckoutCustomData; email: string; prices: Record<PlanKey, string> }> {
  assertRole(ctx, "owner");
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId }, select: { status: true } });
  if (sub && sub.status !== "canceled")
    throw new UserFacingError("This workspace already has a subscription.", "invalid");
  return { customData: checkoutCustomData(ctx.workspaceId), email: ctx.email, prices: config.prices };
}

/**
 * Called by the browser after Paddle checkout completes, so the plan applies
 * without waiting for the webhook (which still arrives and is deduped).
 */
export async function confirmCheckout(
  db: PrismaClient,
  ctx: TenantContext,
  provider: BillingProvider,
  config: BillingConfig,
  transactionId: string,
  now = new Date(),
): Promise<{ applied: boolean }> {
  assertRole(ctx, "owner");
  const txn = await provider.getTransaction(transactionId);
  if (workspaceFromCustomData(txn.custom_data) !== ctx.workspaceId) throw notFound("checkout");
  const sub = txn.subscription_id ? await provider.getSubscription(txn.subscription_id) : null;
  return db.$transaction(async (tx) => {
    const result = sub ? await applySubscription(tx, sub, config, now) : null;
    await applyTransaction(tx, txn);
    return { applied: result?.outcome === "applied" };
  });
}

async function liveSubscription(db: PrismaClient, ctx: TenantContext) {
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } });
  if (!sub || sub.status === "canceled")
    throw new UserFacingError("There’s no active subscription to change.", "invalid");
  if (sub.status === "past_due") {
    throw new UserFacingError("Update your payment method before changing plan — the last payment failed.", "billing");
  }
  return sub;
}

/** Downgrades must fit: the new plan has to hold every active website (existing monitoring never stops). */
async function assertPlanFits(db: PrismaClient, ctx: TenantContext, planKey: PlanKey) {
  const plan = PLANS[planKey];
  const active = await db.site.count({ where: { workspaceId: ctx.workspaceId, status: "active" } });
  if (active > plan.maxActiveSites) {
    const over = active - plan.maxActiveSites;
    throw new UserFacingError(
      `${plan.name} holds ${plan.maxActiveSites} active websites and you have ${active}. Pause ${over} website${over === 1 ? "" : "s"} first.`,
      "plan_limit",
    );
  }
}

export async function previewPlanChange(
  db: PrismaClient,
  ctx: TenantContext,
  provider: BillingProvider,
  config: BillingConfig,
  planKey: PlanKey,
): Promise<PlanChangePreview> {
  assertRole(ctx, "owner");
  const sub = await liveSubscription(db, ctx);
  if (sub.planKey === planKey) throw new UserFacingError(`You’re already on ${PLANS[planKey].name}.`, "invalid");
  await assertPlanFits(db, ctx, planKey);
  return provider.previewPlanChange(sub.providerSubscriptionId, config.prices[planKey]);
}

export async function changePlan(
  db: PrismaClient,
  ctx: TenantContext,
  provider: BillingProvider,
  config: BillingConfig,
  planKey: PlanKey,
  now = new Date(),
): Promise<void> {
  assertRole(ctx, "owner");
  const sub = await liveSubscription(db, ctx);
  if (sub.planKey === planKey) return;
  await assertPlanFits(db, ctx, planKey);
  const updated = await provider.changePlan(sub.providerSubscriptionId, config.prices[planKey]);
  await db.$transaction(async (tx) => {
    await applySubscription(tx, updated, config, now);
    await tx.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "billing.plan_change_requested",
        resourceType: "subscription",
        resourceId: sub.providerSubscriptionId,
        metadata: { from: sub.planKey, to: planKey },
      },
    });
  });
}

export async function portalUrl(db: PrismaClient, ctx: TenantContext, provider: BillingProvider): Promise<string> {
  assertRole(ctx, "owner");
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } });
  if (!sub) throw new UserFacingError("The billing portal is available once you’ve subscribed.", "invalid");
  return provider.portalUrl(sub.providerCustomerId, sub.status === "canceled" ? null : sub.providerSubscriptionId);
}

export async function invoiceUrl(
  db: PrismaClient,
  ctx: TenantContext,
  provider: BillingProvider,
  transactionId: string,
): Promise<string> {
  assertRole(ctx, "admin");
  const txn = await db.billingTransaction.findFirst({
    where: { id: transactionId, workspaceId: ctx.workspaceId },
    select: { id: true, invoiceNumber: true },
  });
  if (!txn?.invoiceNumber) throw notFound("invoice");
  return provider.invoiceUrl(txn.id);
}
