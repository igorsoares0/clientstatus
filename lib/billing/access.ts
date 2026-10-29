import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/config";
import { UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";
import type { Tx } from "@/lib/data/workspace-tx";
import { TRIAL_PLAN, type PlanKey, isPlanKey } from "@/lib/plans";

// Grace and downgrade rules (FR-BILL-05/06). Everything reduces to one column,
// Workspace.accessEndsAt: while it is NULL or in the future the workspace is
// monitored and can start new work; after it passes, existing data stays
// readable but monitoring, audits, alerts, report generation and new websites
// stop until a plan is active again.

const DAY_MS = 24 * 60 * 60_000;

export type SubscriptionFacts = {
  planKey: string;
  status: SubscriptionStatus;
  scheduledChange: string | null;
  scheduledChangeAt: Date | null;
  pastDueSince: Date | null;
  canceledAt: Date | null;
  pausedAt: Date | null;
  providerUpdatedAt: Date;
};

function later(a: Date | null, b: Date): Date {
  return a && a > b ? a : b;
}

/** Plan and access end for a workspace, from its trial and (optional) subscription. */
export function computeAccess(
  trialEndsAt: Date | null,
  sub: SubscriptionFacts | null,
): { planKey: PlanKey; accessEndsAt: Date | null } {
  if (!sub) return { planKey: TRIAL_PLAN, accessEndsAt: trialEndsAt };
  const planKey = isPlanKey(sub.planKey) ? sub.planKey : "starter";
  const scheduledEnd =
    sub.scheduledChange === "cancel" || sub.scheduledChange === "pause" ? sub.scheduledChangeAt : null;
  switch (sub.status) {
    case "active":
    case "trialing":
      return { planKey, accessEndsAt: scheduledEnd };
    case "past_due": {
      const graceEnd = new Date((sub.pastDueSince ?? sub.providerUpdatedAt).getTime() + PAST_DUE_GRACE_DAYS * DAY_MS);
      return { planKey, accessEndsAt: scheduledEnd && scheduledEnd < graceEnd ? scheduledEnd : graceEnd };
    }
    // Unused trial days are honoured if someone cancels right after subscribing.
    case "paused":
      return { planKey, accessEndsAt: later(trialEndsAt, sub.pausedAt ?? sub.providerUpdatedAt) };
    case "canceled":
      return { planKey, accessEndsAt: later(trialEndsAt, sub.canceledAt ?? sub.providerUpdatedAt) };
  }
}

/** A paying customer (or one in Paddle's card-on-file trial), as opposed to our free trial or a lapsed plan. */
export function isPaidSubscription(status: SubscriptionStatus | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function hasAccess(accessEndsAt: Date | null, now = new Date()): boolean {
  return accessEndsAt === null || accessEndsAt > now;
}

/** Prisma filter for workspaces that are still monitored (used by the scheduler). */
export function workspaceWithAccess(now: Date) {
  return { OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: now } }] };
}

export type BillingState =
  | { kind: "trial"; endsAt: Date | null }
  | { kind: "active"; renewsAt: Date | null }
  | { kind: "canceling"; endsAt: Date }
  // Paused or cancelled while unused trial days remain: running until they're used up.
  | { kind: "ending"; endsAt: Date; reason: "canceled" | "paused" }
  | { kind: "past_due"; graceEndsAt: Date }
  | { kind: "lapsed"; since: Date | null; reason: "trial_ended" | "canceled" | "paused" | "payment_failed" };

/** What the Billing page and the shell banner show. */
export function billingState(
  ws: { trialEndsAt: Date | null; accessEndsAt: Date | null },
  sub: (SubscriptionFacts & { currentPeriodEnd: Date | null }) | null,
  now = new Date(),
): BillingState {
  if (!hasAccess(ws.accessEndsAt, now)) {
    const reason = !sub
      ? "trial_ended"
      : sub.status === "past_due"
        ? "payment_failed"
        : sub.status === "paused" || sub.scheduledChange === "pause"
          ? "paused"
          : "canceled";
    return { kind: "lapsed", since: ws.accessEndsAt, reason };
  }
  if (!sub) return { kind: "trial", endsAt: ws.accessEndsAt };
  if (sub.status === "canceled" || sub.status === "paused") {
    return { kind: "ending", endsAt: ws.accessEndsAt!, reason: sub.status };
  }
  if (sub.status === "past_due") return { kind: "past_due", graceEndsAt: ws.accessEndsAt! };
  if (ws.accessEndsAt) return { kind: "canceling", endsAt: ws.accessEndsAt };
  return { kind: "active", renewsAt: sub.currentPeriodEnd };
}

export const LAPSED_MESSAGE =
  "Monitoring is stopped because this workspace has no active plan. Choose a plan in Billing to resume — your data is kept.";

/**
 * Throws unless the workspace may start new work: add or resume websites,
 * run checks or audits, generate or send reports.
 */
export async function assertCanOperate(db: PrismaClient | Tx, ctx: TenantContext, now = new Date()): Promise<void> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: { accessEndsAt: true } });
  if (!hasAccess(ws.accessEndsAt, now)) throw new UserFacingError(LAPSED_MESSAGE, "billing");
}
