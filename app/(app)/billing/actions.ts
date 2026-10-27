"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { billingConfig } from "@/lib/billing/config";
import { PaddleApiError, paddleApi, type PlanChangePreview } from "@/lib/billing/paddle";
import { db } from "@/lib/db";
import { changePlan, confirmCheckout, invoiceUrl, portalUrl, previewPlanChange } from "@/lib/data/billing";
import { logger } from "@/lib/log";
import { isPlanKey, type PlanKey } from "@/lib/plans";
import { requireMembership } from "@/lib/session";

const log = logger("billing-action");

const NOT_CONFIGURED = { ok: false as const, error: "Billing isn’t configured on this server." };

function providerFor() {
  const config = billingConfig();
  return config ? { config, provider: paddleApi(config) } : null;
}

/** Paddle errors are logged with their code; the user gets a plain message. */
function billingError(error: unknown, context: string) {
  if (error instanceof PaddleApiError) {
    log.error(`${context} failed at Paddle`, { status: error.status, code: error.code, error });
    return { ok: false as const, error: "Paddle couldn’t complete that right now. Nothing was changed — try again." };
  }
  return toActionError(error, context);
}

const planSchema = z.string().refine(isPlanKey);

export async function confirmCheckoutAction(transactionId: string): Promise<ActionResult<{ applied: boolean }>> {
  const ctx = await requireMembership();
  const p = providerFor();
  if (!p) return NOT_CONFIGURED;
  if (!/^txn_[a-z\d]{26}$/.test(transactionId)) return { ok: false, error: "That checkout isn’t valid." };
  try {
    const { applied } = await confirmCheckout(db, ctx, p.provider, p.config, transactionId);
    refresh();
    return { ok: true, applied };
  } catch (error) {
    return billingError(error, "confirm checkout");
  }
}

export async function previewPlanChangeAction(planKey: string): Promise<ActionResult<{ preview: PlanChangePreview }>> {
  const ctx = await requireMembership();
  const p = providerFor();
  if (!p) return NOT_CONFIGURED;
  if (!planSchema.safeParse(planKey).success) return { ok: false, error: "Choose a plan." };
  try {
    return { ok: true, preview: await previewPlanChange(db, ctx, p.provider, p.config, planKey as PlanKey) };
  } catch (error) {
    return billingError(error, "preview plan change");
  }
}

export async function changePlanAction(planKey: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  const p = providerFor();
  if (!p) return NOT_CONFIGURED;
  if (!planSchema.safeParse(planKey).success) return { ok: false, error: "Choose a plan." };
  try {
    await changePlan(db, ctx, p.provider, p.config, planKey as PlanKey);
    refresh();
    return { ok: true };
  } catch (error) {
    return billingError(error, "change plan");
  }
}

export async function portalUrlAction(): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireMembership();
  const p = providerFor();
  if (!p) return NOT_CONFIGURED;
  try {
    return { ok: true, url: await portalUrl(db, ctx, p.provider) };
  } catch (error) {
    return billingError(error, "open billing portal");
  }
}

export async function invoiceUrlAction(transactionId: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireMembership();
  const p = providerFor();
  if (!p) return NOT_CONFIGURED;
  try {
    return { ok: true, url: await invoiceUrl(db, ctx, p.provider, transactionId) };
  } catch (error) {
    return billingError(error, "open invoice");
  }
}
