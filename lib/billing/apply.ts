import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { computeAccess } from "@/lib/billing/access";
import { workspaceFromCustomData } from "@/lib/billing/checkout-token";
import { planForPrice, type BillingConfig } from "@/lib/billing/config";
import {
  subscriptionEntity,
  transactionEntity,
  type PaddleSubscription,
  type PaddleTransaction,
  type WebhookEvent,
} from "@/lib/billing/paddle";
import type { Tx } from "@/lib/data/workspace-tx";
import { logger } from "@/lib/log";

// Applies Paddle subscription and transaction state (FR-BILL-01/08). Webhooks,
// checkout confirmation and in-app plan changes all go through here, so they
// agree. Idempotent: duplicate events are recorded once, and entities older
// than what we already applied (by Paddle's updated_at) are ignored, which
// makes out-of-order delivery safe.

const log = logger("billing");

export type ApplyOutcome = { outcome: "applied" | "ignored"; workspaceId: string | null; reason?: string };

/** Recomputes the workspace's plan and access end from its trial and subscription. */
export async function syncWorkspaceAccess(tx: Tx, workspaceId: string) {
  const ws = await tx.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { trialEndsAt: true, subscription: true },
  });
  const { planKey, accessEndsAt } = computeAccess(ws.trialEndsAt, ws.subscription);
  await tx.workspace.update({ where: { id: workspaceId }, data: { planKey, accessEndsAt } });
  return { planKey, accessEndsAt };
}

export async function applySubscription(
  tx: Tx,
  sub: PaddleSubscription,
  config: BillingConfig,
  now: Date,
): Promise<ApplyOutcome> {
  const planKey = planForPrice(config, sub.items[0]!.price.id);
  if (!planKey) return { outcome: "ignored", workspaceId: null, reason: "unknown price" };

  const linked = await tx.subscription.findUnique({ where: { providerSubscriptionId: sub.id } });
  const workspaceId = linked?.workspaceId ?? workspaceFromCustomData(sub.custom_data);
  if (!workspaceId) return { outcome: "ignored", workspaceId: null, reason: "no verified workspace" };
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!workspace) return { outcome: "ignored", workspaceId: null, reason: "workspace not found" };

  const current = linked ?? (await tx.subscription.findUnique({ where: { workspaceId } }));
  if (current && current.providerSubscriptionId !== sub.id) {
    // A second subscription for the same workspace never displaces one that is still live.
    const live = current.status !== "canceled";
    if (live && sub.status !== "canceled") {
      log.error("second live subscription for a workspace — needs a manual refund", {
        workspaceId,
        existing: current.providerSubscriptionId,
        incoming: sub.id,
      });
      return { outcome: "ignored", workspaceId, reason: "workspace already has a live subscription" };
    }
    if (sub.status === "canceled") return { outcome: "ignored", workspaceId, reason: "other subscription canceled" };
  }
  if (current?.providerSubscriptionId === sub.id && current.providerUpdatedAt > sub.updated_at) {
    return { outcome: "ignored", workspaceId, reason: "stale" };
  }

  const data = {
    providerCustomerId: sub.customer_id,
    providerSubscriptionId: sub.id,
    planKey,
    status: sub.status,
    currentPeriodStart: sub.current_billing_period?.starts_at ?? null,
    currentPeriodEnd: sub.current_billing_period?.ends_at ?? null,
    scheduledChange: sub.scheduled_change?.action ?? null,
    scheduledChangeAt: sub.scheduled_change?.effective_at ?? null,
    pastDueSince:
      sub.status === "past_due"
        ? current?.providerSubscriptionId === sub.id && current.pastDueSince
          ? current.pastDueSince
          : now
        : null,
    canceledAt: sub.status === "canceled" ? (sub.canceled_at ?? now) : null,
    pausedAt: sub.status === "paused" ? (sub.paused_at ?? now) : null,
    providerUpdatedAt: sub.updated_at,
  };
  await tx.subscription.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
  await syncWorkspaceAccess(tx, workspaceId);

  if (!current || current.status !== sub.status || current.planKey !== planKey) {
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorUserId: null,
        action: "billing.subscription_changed",
        resourceType: "subscription",
        resourceId: sub.id,
        metadata: { status: sub.status, planKey, previousStatus: current?.status ?? null },
      },
    });
  }
  return { outcome: "applied", workspaceId };
}

export async function applyTransaction(
  tx: Tx,
  txn: PaddleTransaction,
  opts: { failed?: boolean } = {},
): Promise<ApplyOutcome> {
  const bySub = txn.subscription_id
    ? await tx.subscription.findUnique({ where: { providerSubscriptionId: txn.subscription_id } })
    : null;
  const workspaceId = bySub?.workspaceId ?? workspaceFromCustomData(txn.custom_data);
  if (!workspaceId) return { outcome: "ignored", workspaceId: null, reason: "no verified workspace" };
  if (!(await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) {
    return { outcome: "ignored", workspaceId: null, reason: "workspace not found" };
  }
  const existing = await tx.billingTransaction.findUnique({ where: { id: txn.id } });
  if (existing && existing.providerUpdatedAt > txn.updated_at)
    return { outcome: "ignored", workspaceId, reason: "stale" };

  const card = [...txn.payments].reverse().find((p) => p.method_details?.card)?.method_details?.card;
  const data = {
    workspaceId,
    status: opts.failed ? "failed" : txn.status,
    invoiceNumber: txn.invoice_number ?? null,
    total: Number(txn.details.totals.grand_total),
    currency: txn.currency_code,
    billedAt: txn.billed_at ?? txn.created_at,
    cardBrand: card?.type ?? null,
    cardLast4: card?.last4 ?? null,
    cardExpiry:
      card?.expiry_month && card.expiry_year
        ? `${String(card.expiry_month).padStart(2, "0")}/${card.expiry_year}`
        : null,
    providerUpdatedAt: txn.updated_at,
  };
  await tx.billingTransaction.upsert({ where: { id: txn.id }, create: { id: txn.id, ...data }, update: data });
  return { outcome: "applied", workspaceId };
}

const TRANSACTION_EVENTS: Record<string, { failed?: boolean }> = {
  "transaction.completed": {},
  "transaction.paid": {},
  "transaction.past_due": {},
  "transaction.payment_failed": { failed: true },
};

/** Processes one verified webhook event. Safe to call again with the same event. */
export async function processWebhookEvent(
  db: PrismaClient,
  event: WebhookEvent,
  config: BillingConfig,
  now = new Date(),
): Promise<"applied" | "ignored" | "duplicate"> {
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.billingEvent.findUnique({ where: { id: event.event_id }, select: { id: true } })) return "duplicate";
      let result: ApplyOutcome = { outcome: "ignored", workspaceId: null, reason: "unhandled event type" };
      if (event.event_type.startsWith("subscription.")) {
        result = await applySubscription(tx, subscriptionEntity.parse(event.data), config, now);
      } else if (event.event_type in TRANSACTION_EVENTS) {
        result = await applyTransaction(tx, transactionEntity.parse(event.data), TRANSACTION_EVENTS[event.event_type]);
      }
      await tx.billingEvent.create({
        data: {
          id: event.event_id,
          eventType: event.event_type,
          occurredAt: event.occurred_at,
          outcome: result.outcome,
          workspaceId: result.workspaceId,
        },
      });
      if (result.outcome === "ignored" && result.reason !== "unhandled event type") {
        log.warn("billing event ignored", { eventId: event.event_id, type: event.event_type, reason: result.reason });
      }
      return result.outcome;
    });
  } catch (error) {
    // Two deliveries of the same event racing: the loser sees the unique violation.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}
