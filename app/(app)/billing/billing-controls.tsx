"use client";

import { CheckoutEventNames, initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { PlanChangePreview } from "@/lib/billing/paddle";
import type { BillingConfig } from "@/lib/billing/config";
import { PLAN_ORDER, PLANS, monthsFreeYearly, planPrice, type BillingInterval, type PlanKey } from "@/lib/plans";
import {
  changePlanAction,
  confirmCheckoutAction,
  invoiceUrlAction,
  portalUrlAction,
  previewPlanChangeAction,
} from "./actions";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

/** Upgrade wording: account credit left by earlier downgrades pays first. */
function chargeText({ amount, creditUsed, dueNow, currency }: PlanChangePreview) {
  const price = money(amount, currency);
  if (creditUsed <= 0) return `You’ll be charged ${price} today for the rest of this billing period.`;
  if (dueNow <= 0) {
    return `The ${price} for the rest of this billing period comes out of your account credit, so nothing is charged today.`;
  }
  return `The rest of this billing period costs ${price}: ${money(creditUsed, currency)} comes out of your account credit and ${money(dueNow, currency)} is charged today.`;
}

/**
 * Opens a Paddle-hosted page in a new tab. The tab is opened synchronously on
 * click (so popup blockers allow it) and pointed at the URL once we have it.
 */
function useOpenInNewTab() {
  const toast = useToast();
  const [pending, start] = useTransition();
  function open(getUrl: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) {
    const tab = window.open("about:blank", "_blank");
    start(async () => {
      const r = await getUrl();
      if (!r.ok) {
        tab?.close();
        toast.show(r.error);
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = r.url;
      } else window.location.href = r.url;
    });
  }
  return { open, pending };
}

export function PortalButton({ label, variant = "secondary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { open, pending } = useOpenInNewTab();
  return (
    <Button size="sm" variant={variant} disabled={pending} onClick={() => open(portalUrlAction)}>
      {pending ? "Opening…" : label}
    </Button>
  );
}

export function InvoiceButton({ transactionId }: { transactionId: string }) {
  const { open, pending } = useOpenInNewTab();
  return (
    <Button variant="link" disabled={pending} onClick={() => open(() => invoiceUrlAction(transactionId))}>
      {pending ? "Opening…" : "PDF"}
    </Button>
  );
}

/** Monthly / Yearly switch shared by checkout and plan changes. */
function IntervalToggle({
  value,
  onChange,
  disabled,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  disabled?: boolean;
}) {
  // Every plan is priced the same way, so any plan gives the saving.
  const free = monthsFreeYearly(PLANS.growth);
  const options = [
    ["month", "Monthly", null],
    ["year", "Yearly", `${free} months free`],
  ] as const;
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="flex w-fit flex-wrap border border-border-strong bg-surface"
    >
      {options.map(([v, label, note]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`flex h-8 items-center gap-1.5 border-0 px-3 text-[13px] ${value === v ? "bg-ink text-white" : "bg-surface text-ink"}`}
        >
          {label}
          {note ? <span className={`text-xs ${value === v ? "opacity-80" : "text-up"}`}>{note}</span> : null}
        </button>
      ))}
    </div>
  );
}

type PlanCardProps = {
  planKey: PlanKey;
  interval: BillingInterval;
  activeSites: number;
  current?: boolean;
  children: React.ReactNode;
};

function PlanOption({ planKey, interval, activeSites, current, children }: PlanCardProps) {
  const plan = PLANS[planKey];
  const tooSmall = activeSites > plan.maxActiveSites;
  return (
    <li className={`flex flex-col gap-2 border p-4 ${current ? "border-ink" : "border-border"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-base font-semibold">{plan.name}</h3>
        <span className="font-semibold tabular">
          ${planPrice(plan, interval).toLocaleString("en-US")}
          <span className="text-xs font-normal text-muted"> / {interval}</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-ink-2">
        <li>{plan.maxActiveSites} active websites</li>
        <li>Uptime every {plan.uptimeIntervalSeconds / 60} min</li>
        <li>
          Audits every {plan.auditEveryDays} days · up to {plan.maxPagesPerAudit.toLocaleString("en-US")} pages
        </li>
        <li>
          Up to {plan.maxTeamMembers} team {plan.maxTeamMembers === 1 ? "member" : "members"}
        </li>
      </ul>
      {tooSmall ? (
        <p className="m-0 text-xs text-degraded">
          Holds {plan.maxActiveSites} — you have {activeSites} active. Pause {activeSites - plan.maxActiveSites} first.
        </p>
      ) : null}
      <div className="mt-auto pt-1">{children}</div>
    </li>
  );
}

/** No live subscription: pick a plan and pay in Paddle's overlay checkout. */
export function PlanPicker({
  environment,
  clientToken,
  email,
  customData,
  prices,
  activeSites,
}: {
  environment: "sandbox" | "production";
  clientToken: string;
  email: string;
  customData: Record<string, string>;
  prices: BillingConfig["prices"];
  activeSites: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const paddle = useRef<Paddle | undefined>(undefined);
  const [period, setPeriod] = useState<BillingInterval>("month");
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<"idle" | "confirming" | "waiting">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initializePaddle({
      environment,
      token: clientToken,
      eventCallback: (event) => {
        if (event.name !== CheckoutEventNames.CHECKOUT_COMPLETED || !event.data) return;
        const transactionId = event.data.transaction_id;
        setPhase("confirming");
        paddle.current?.Checkout.close();
        void confirmCheckoutAction(transactionId).then((r) => {
          if (r.ok && r.applied) {
            toast.show("Subscription active — thank you");
            setPhase("idle");
            router.refresh();
          } else {
            // The webhook will apply it; keep refreshing until it lands.
            setPhase("waiting");
          }
        });
      },
    })
      .then((instance) => {
        if (cancelled) return;
        paddle.current = instance;
        setReady(Boolean(instance));
        if (!instance) setError("Paddle checkout couldn’t load. Check your connection or ad blocker and reload.");
      })
      .catch(() => !cancelled && setError("Paddle checkout couldn’t load. Reload the page to try again."));
    return () => {
      cancelled = true;
    };
  }, [environment, clientToken, router, toast]);

  useEffect(() => {
    if (phase !== "waiting") return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      router.refresh();
      if (tries >= 20) {
        clearInterval(timer);
        setPhase("idle");
        setError("Payment received, but Paddle hasn’t confirmed it yet. Your plan updates as soon as it does.");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, router]);

  function choose(planKey: PlanKey) {
    setError(null);
    paddle.current?.Checkout.open({
      items: [{ priceId: (prices[period] ?? prices.month)[planKey], quantity: 1 }],
      customer: { email },
      customData,
      settings: { displayMode: "overlay", theme: "light", allowLogout: false, showAddTaxId: true },
    });
  }

  if (phase !== "idle") {
    return (
      <p role="status" className="m-0 border border-border bg-surface px-4 py-3 text-[13px]">
        {phase === "confirming"
          ? "Confirming your payment with Paddle…"
          : "Payment received — waiting for Paddle to confirm…"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-down">
          {error}
        </p>
      ) : null}
      {prices.year ? <IntervalToggle value={period} onChange={setPeriod} /> : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 tbl:grid-cols-3">
        {PLAN_ORDER.map((key) => (
          <PlanOption key={key} planKey={key} interval={period} activeSites={activeSites}>
            <Button
              size="sm"
              className="w-full"
              disabled={!ready || activeSites > PLANS[key].maxActiveSites}
              onClick={() => choose(key)}
            >
              Choose {PLANS[key].name}
            </Button>
          </PlanOption>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted">
        Billed {period === "year" ? "yearly" : "monthly"} in USD by Paddle, our reseller; tax is added at checkout where
        it applies. Cancel any time in the billing portal.
      </p>
    </div>
  );
}

/** Live subscription: switch plan or billing period with a prorated preview first. */
export function ChangePlan({
  currentPlan,
  currentPeriod,
  yearlyAvailable,
  activeSites,
}: {
  currentPlan: PlanKey;
  currentPeriod: BillingInterval;
  yearlyAvailable: boolean;
  activeSites: number;
}) {
  const router = useRouter();
  const toast = useToast();
  // Plan changes keep the current billing period unless the owner switches it here.
  const [period, setPeriod] = useState<BillingInterval>(currentPeriod);
  const [target, setTarget] = useState<PlanKey | null>(null);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(planKey: PlanKey) {
    setTarget(planKey);
    setPreview(null);
    setError(null);
    start(async () => {
      const r = await previewPlanChangeAction(planKey, period);
      if (!r.ok) return setError(r.error);
      setPreview(r.preview);
    });
  }

  function confirm() {
    if (!target) return;
    start(async () => {
      const r = await changePlanAction(target, period);
      if (!r.ok) return setError(r.error);
      toast.show(`Plan changed to ${PLANS[target].name}, billed ${period === "year" ? "yearly" : "monthly"}`);
      setTarget(null);
      setPreview(null);
      router.refresh();
    });
  }

  function switchPeriod(next: BillingInterval) {
    setPeriod(next);
    setTarget(null);
    setPreview(null);
    setError(null);
  }

  function actionLabel(key: PlanKey) {
    if (key === currentPlan) return `Switch to ${period === "year" ? "yearly" : "monthly"} billing`;
    const up = PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan);
    return `${up ? "Upgrade" : "Downgrade"} to ${PLANS[key].name}`;
  }

  return (
    <div className="flex flex-col gap-3">
      {yearlyAvailable || currentPeriod === "year" ? (
        <IntervalToggle value={period} onChange={switchPeriod} disabled={pending} />
      ) : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 tbl:grid-cols-3">
        {PLAN_ORDER.map((key) => (
          <PlanOption key={key} planKey={key} interval={period} activeSites={activeSites} current={key === currentPlan}>
            {key === currentPlan && period === currentPeriod ? (
              <span className="text-[13px] font-semibold">Current plan</span>
            ) : (
              <Button
                size="sm"
                variant={target === key ? "primary" : "secondary"}
                className="w-full"
                disabled={pending || activeSites > PLANS[key].maxActiveSites}
                onClick={() => pick(key)}
              >
                {actionLabel(key)}
              </Button>
            )}
          </PlanOption>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-down">
          {error}
        </p>
      ) : null}
      {target && (preview || pending) ? (
        <section
          aria-label="Confirm plan change"
          className="flex flex-col gap-2 border border-border-strong bg-surface px-4 py-3 text-[13px]"
        >
          {preview ? (
            <>
              <p className="m-0">
                Switch to <b>{PLANS[target].name}</b>, billed {period === "year" ? "yearly" : "monthly"}, now.{" "}
                {preview.action === "charge"
                  ? chargeText(preview)
                  : preview.action === "credit"
                    ? `${money(preview.amount, preview.currency)} is credited to your next invoices.`
                    : "Nothing is charged today."}
              </p>
              {period !== currentPeriod ? (
                // Paddle starts a new billing period when the interval changes (seen in the sandbox).
                <p className="m-0">
                  Switching between monthly and yearly starts a new billing period today, so your renewal date moves to{" "}
                  {period === "year" ? "a year" : "a month"} from now.
                </p>
              ) : null}
              <p className="m-0 text-muted">New limits apply straight away. Existing monitoring keeps running.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={confirm}>
                  {pending ? "Changing…" : `Confirm change to ${PLANS[target].name}`}
                </Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => setTarget(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <p role="status" className="m-0 text-muted">
              Working out the prorated amount…
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
