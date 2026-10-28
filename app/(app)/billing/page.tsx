import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelSkeleton } from "@/components/shell/page";
import { checkoutOptions, getBillingOverview } from "@/lib/data/billing";
import { manualAuditsUsed } from "@/lib/data/audits";
import { siteCounts } from "@/lib/data/sites";
import type { BillingState } from "@/lib/billing/access";
import { billingConfig } from "@/lib/billing/config";
import { db } from "@/lib/db";
import { formatLongDate } from "@/lib/format";
import { RETENTION_DAYS } from "@/lib/monitoring/scheduler";
import { env } from "@/lib/env";
import {
  BRANDING_LABEL,
  getPlan,
  isLargestPlan,
  isPlanKey,
  moreSitesHint,
  planPrice,
  type Plan,
  type PlanKey,
} from "@/lib/plans";
import { requireMembership } from "@/lib/session";
import { ChangePlan, InvoiceButton, PlanPicker, PortalButton } from "./billing-controls";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Billing</h1>
        <span className="text-[13px] text-muted">Only owners can change the plan or payment method.</span>
      </header>
      <Suspense
        fallback={
          <div className="px-7">
            <PanelSkeleton />
          </div>
        }
      >
        <Billing />
      </Suspense>
    </>
  );
}

type Chip = { label: string; cls: string; sub: string };

function chipFor(state: BillingState, tz: string): Chip {
  const d = (date: Date | null) => (date ? formatLongDate(date, tz) : "");
  switch (state.kind) {
    case "trial":
      return {
        label: "Trial",
        cls: "border-warn-border text-degraded",
        sub: `Ends ${d(state.endsAt)} · no card on file`,
      };
    case "active":
      return {
        label: "Active",
        cls: "border-[#9CC5AE] text-up",
        sub: state.renewsAt ? `Renews ${d(state.renewsAt)}` : "",
      };
    case "canceling":
      return {
        label: `Cancels ${d(state.endsAt)}`,
        cls: "border-warn-border text-degraded",
        sub: `Monitoring stops ${d(state.endsAt)} · data is kept`,
      };
    case "ending":
      return {
        label: state.reason === "paused" ? "Paused" : "Canceled",
        cls: "border-warn-border text-degraded",
        sub: `Trial days left · monitoring stops ${d(state.endsAt)}`,
      };
    case "past_due":
      return {
        label: "Payment failed",
        cls: "border-down-border text-down",
        sub: `Retrying · access continues until ${d(state.graceEndsAt)}`,
      };
    case "lapsed":
      return {
        label: "No active plan",
        cls: "border-warn-border text-degraded",
        sub: `Monitoring stopped ${d(state.since)} · data is kept`,
      };
  }
}

type Banner = { glyph: string; tone: "warn" | "down"; title: string; text: string; cta: "portal" | "plans" | null };

function bannerFor(state: BillingState, tz: string, plan: Plan, active: number): Banner | null {
  const d = (date: Date | null) => (date ? formatLongDate(date, tz) : "");
  switch (state.kind) {
    case "past_due":
      return {
        glyph: "◆",
        tone: "down",
        title: "Payment failed",
        text: `Monitoring and alerts continue as normal until ${d(state.graceEndsAt)} while Paddle retries the card. Update the payment method to keep everything running.`,
        cta: "portal",
      };
    case "canceling":
      return {
        glyph: "▲",
        tone: "warn",
        title: `Subscription ends ${d(state.endsAt)}`,
        text: "Monitoring, alerts and new reports stop then. Your websites, history and reports are kept, and you can resume any time.",
        cta: "portal",
      };
    case "ending":
      return {
        glyph: "▲",
        tone: "warn",
        title: state.reason === "paused" ? "Subscription paused" : "Subscription canceled",
        text: `Your unused trial days still count, so monitoring, alerts and reports continue until ${d(state.endsAt)}. Then they stop — websites, history and reports are kept.${state.reason === "paused" ? " Resume the subscription in the billing portal to keep going." : ""}`,
        cta: state.reason === "paused" ? "portal" : "plans",
      };
    case "lapsed": {
      const title =
        state.reason === "trial_ended"
          ? `Trial ended ${d(state.since)}`
          : state.reason === "payment_failed"
            ? `Payment grace period ended ${d(state.since)}`
            : state.reason === "paused"
              ? `Subscription paused ${d(state.since)}`
              : `Subscription ended ${d(state.since)}`;
      return {
        glyph: "▲",
        tone: "warn",
        title,
        text: "Monitoring, alerts, audits and new reports are stopped. Everything you set up and all history are kept — choose a plan to resume.",
        cta: state.reason === "payment_failed" || state.reason === "paused" ? "portal" : "plans",
      };
    }
    default:
      if (active >= plan.maxActiveSites) {
        return {
          glyph: "▲",
          tone: "warn",
          title: `Plan limit reached — ${active} of ${plan.maxActiveSites} websites`,
          text: `All existing websites keep being monitored. To add more, pause or archive one, or ${moreSitesHint(plan, env().SUPPORT_EMAIL)}.`,
          cta: isLargestPlan(plan) ? null : "plans",
        };
      }
      return null;
  }
}

async function Billing() {
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const config = billingConfig();
  const isOwner = ctx.role === "owner";
  const [overview, counts, auditsUsed] = await Promise.all([
    getBillingOverview(db, ctx),
    siteCounts(db, ctx),
    manualAuditsUsed(db, ctx),
  ]);
  const planKey: PlanKey = isPlanKey(overview.planKey) ? overview.planKey : "starter";
  const plan = getPlan(planKey);
  const { state, subscription: sub } = overview;
  const chip = chipFor(state, tz);
  const banner = bannerFor(state, tz, plan, counts.active);
  const period = sub && sub.status !== "canceled" ? sub.billingInterval : "month";
  const hasLiveSub = sub !== null && sub.status !== "canceled";
  const checkout =
    config && isOwner && !hasLiveSub ? await checkoutOptions(db, { ...ctx, email: ctx.user.email }, config) : null;
  const usedPct = Math.min(100, Math.round((counts.active / plan.maxActiveSites) * 100));
  const warnAt = Math.ceil(plan.maxActiveSites * 0.9);
  const left = Math.max(0, plan.maxActiveSites - counts.active);

  return (
    <>
      {banner ? (
        <div
          role="alert"
          className={`mx-7 mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border px-4 py-2.5 ${
            banner.tone === "down" ? "border-down-border bg-down-tint" : "border-warn-border bg-warn-tint"
          }`}
        >
          <span className={`font-semibold ${banner.tone === "down" ? "text-down" : "text-degraded"}`}>
            <span aria-hidden="true">{banner.glyph}</span> {banner.title}
          </span>
          <span className="flex-[1_1_360px] text-ink-2">{banner.text}</span>
          {isOwner && banner.cta === "portal" && sub ? (
            <PortalButton
              variant="primary"
              label={
                state.kind === "canceling" || state.kind === "ending" || sub.status === "paused"
                  ? "Manage subscription"
                  : "Update payment method"
              }
            />
          ) : null}
          {isOwner && banner.cta === "plans" ? (
            <a href="#plans" className="text-[13px] font-semibold">
              {state.kind === "lapsed" ? "Choose a plan" : "Change plan"}
            </a>
          ) : null}
        </div>
      ) : null}

      <main className="flex flex-1 flex-wrap items-start gap-6 px-7 pb-8">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-5 max-w-[820px]">
          <section aria-labelledby="h-plan" className="border border-border bg-surface">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-rule p-4">
              <h2 id="h-plan" className="m-0 text-xl font-semibold font-stretch-85%">
                {plan.name} plan
              </h2>
              <span className={`border px-2 py-px font-semibold ${chip.cls}`}>{chip.label}</span>
              {chip.sub ? <span className="text-[13px] text-muted">{chip.sub}</span> : null}
              <span className="ml-auto text-lg font-semibold font-stretch-88% tabular">
                ${planPrice(plan, period).toLocaleString("en-US")}{" "}
                <span className="text-[13px] font-normal text-muted">
                  / {period}, billed {period === "year" ? "yearly" : "monthly"}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-semibold">Websites</span>
                <span className="text-[15px] tabular">
                  <b>{counts.active}</b> of {plan.maxActiveSites} monitored
                </span>
                <span className="text-[12.5px] text-muted">
                  {counts.paused ? `+ ${counts.paused} paused (don’t count) · ` : ""}
                  {left} {left === 1 ? "slot" : "slots"} left
                </span>
              </div>
              <div
                role="meter"
                aria-label="Plan usage"
                aria-valuemin={0}
                aria-valuemax={plan.maxActiveSites}
                aria-valuenow={counts.active}
                className="relative h-2.5 bg-[#E7E9E6]"
              >
                <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${usedPct}%` }} />
                <span className="absolute -inset-y-[3px] left-[90%] w-px bg-faint" />
              </div>
              <span className="text-[12.5px] text-muted">
                We email owners at {warnAt} sites. At {plan.maxActiveSites}, new websites can’t be added until a slot is
                freed or the plan changes — existing monitoring is never stopped.
              </span>
            </div>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-3 px-4 pb-4 text-[13.5px]">
              <Fact term="CHECK INTERVAL">
                Every {plan.uptimeIntervalSeconds === 60 ? "minute" : `${plan.uptimeIntervalSeconds / 60} minutes`}
              </Fact>
              <Fact term="AUDITS">
                Every {plan.auditEveryDays} days · {plan.maxPagesPerAudit.toLocaleString("en-US")} pages ·{" "}
                {plan.manualAuditsPerWeek} manual reruns / week <span className="text-muted">({auditsUsed} used)</span>
              </Fact>
              <Fact term="REPORTS">{BRANDING_LABEL[plan.reportBranding]}</Fact>
              <Fact term="TEAM">
                Up to {plan.maxTeamMembers} {plan.maxTeamMembers === 1 ? "member" : "members"}
              </Fact>
              <Fact term="HISTORY">Raw checks {RETENTION_DAYS} days · reports kept</Fact>
            </dl>
            {isOwner && sub ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">
                <PortalButton label="Manage billing" />
                <span className="text-[12.5px] text-muted">
                  Cancellation, payment method, billing details and invoices are handled in the secure billing portal
                  (Paddle).
                </span>
              </div>
            ) : null}
          </section>

          <section
            id="plans"
            aria-labelledby="h-plans"
            className="flex flex-col gap-3 border border-border bg-surface p-4"
          >
            <h2 id="h-plans" className="m-0 text-[15px] font-semibold">
              {hasLiveSub ? "Change plan" : "Choose a plan"}
            </h2>
            {!config ? (
              <p className="m-0 text-[13px] text-muted">
                Billing isn’t configured on this server (Paddle keys missing), so plans can’t be bought here.
              </p>
            ) : !isOwner ? (
              <p className="m-0 text-[13px] text-muted">Only the workspace owner can change the plan.</p>
            ) : sub?.status === "past_due" ? (
              <p className="m-0 text-[13px] text-muted">
                Update the payment method first — plan changes are blocked while a payment is outstanding.
              </p>
            ) : sub?.status === "paused" ? (
              <p className="m-0 text-[13px] text-muted">
                The subscription is paused. Resume it in the billing portal to change plan.
              </p>
            ) : hasLiveSub ? (
              <ChangePlan
                currentPlan={planKey}
                currentPeriod={sub!.billingInterval}
                yearlyAvailable={config.prices.year !== null}
                activeSites={counts.active}
              />
            ) : checkout ? (
              <PlanPicker
                environment={config.environment}
                clientToken={config.clientToken}
                email={checkout.email}
                customData={checkout.customData}
                prices={checkout.prices}
                activeSites={counts.active}
              />
            ) : null}
          </section>

          <section aria-labelledby="h-inv" className="border border-border bg-surface">
            <div className="flex items-baseline gap-3 border-b border-border px-4 py-3">
              <h2 id="h-inv" className="m-0 text-[15px] font-semibold">
                Invoices
              </h2>
            </div>
            {overview.transactions.length === 0 ? (
              <p className="m-0 px-4 py-3 text-[13px] text-muted">
                No invoices yet — they appear here after the first payment.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {overview.transactions.map((t) => {
                  const failed = t.status === "failed" || t.status === "past_due";
                  return (
                    <li
                      key={t.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b border-rule-soft px-4 py-2.5 text-[13.5px] tabular last:border-b-0 tbl:grid-cols-[110px_minmax(0,1fr)_90px_90px_40px]"
                    >
                      <span className="flex flex-col tbl:contents">
                        <span className="font-semibold">{formatLongDate(t.billedAt, tz)}</span>
                        <span className="truncate font-mono text-[12.5px] text-muted">{t.invoiceNumber ?? "—"}</span>
                      </span>
                      <span className="text-right">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency }).format(
                          t.total / 100,
                        )}
                      </span>
                      <span className={`text-right font-semibold ${failed ? "text-down" : "text-up"}`}>
                        <span aria-hidden="true">{failed ? "◆" : "●"}</span> {failed ? "Failed" : "Paid"}
                      </span>
                      <span className="text-right">
                        {t.invoiceNumber && ctx.role !== "member" ? <InvoiceButton transactionId={t.id} /> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-[260px] flex-[0_1_320px] flex-col gap-5">
          <section aria-labelledby="h-pm" className="flex flex-col border border-border bg-surface">
            <h2 id="h-pm" className="m-0 border-b border-border px-4 py-3 text-[15px] font-semibold">
              Payment method
            </h2>
            <div className="flex flex-col gap-1 px-4 py-3">
              {overview.card ? (
                <>
                  <span className="font-semibold">
                    {cardLabel(overview.card.brand)} ending {overview.card.last4}
                  </span>
                  <span className={`text-[13px] ${overview.card.failed ? "text-down" : "text-muted"}`}>
                    {overview.card.failed
                      ? "The last payment was declined"
                      : overview.card.expiry
                        ? `Expires ${overview.card.expiry}`
                        : ""}
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-muted">No card on file.</span>
              )}
            </div>
            {isOwner && sub ? (
              <div className="px-4 pb-3.5">
                <PortalButton label="Update in portal" />
              </div>
            ) : null}
          </section>
          <section aria-labelledby="h-rules" className="flex flex-col border border-border bg-surface">
            <h2 id="h-rules" className="m-0 border-b border-border px-4 py-3 text-[15px] font-semibold">
              If a payment fails or you cancel
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-1.5 px-4 py-3 pl-8 text-[13px] text-ink-2">
              <li>A failed payment keeps everything running for 14 days while Paddle retries.</li>
              <li>After cancelling, monitoring runs until the end of the paid period.</li>
              <li>
                Without an active plan, monitoring, alerts, audits and new reports stop. Websites, history and reports
                stay readable.
              </li>
            </ul>
          </section>
        </aside>
      </main>
    </>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs tracking-[.03em] text-muted">{term}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function cardLabel(brand: string | null) {
  if (!brand) return "Card";
  const known: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", american_express: "Amex" };
  return known[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1).replaceAll("_", " ");
}
