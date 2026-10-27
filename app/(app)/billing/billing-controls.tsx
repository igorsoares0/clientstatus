"use client";

import { CheckoutEventNames, initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { PlanChangePreview } from "@/lib/billing/paddle";
import { PLANS, type PlanKey } from "@/lib/plans";
import {
  changePlanAction,
  confirmCheckoutAction,
  invoiceUrlAction,
  portalUrlAction,
  previewPlanChangeAction,
} from "./actions";

const PLAN_ORDER: PlanKey[] = ["starter", "growth", "pro"];

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
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

type PlanCardProps = { planKey: PlanKey; activeSites: number; current?: boolean; children: React.ReactNode };

function PlanOption({ planKey, activeSites, current, children }: PlanCardProps) {
  const plan = PLANS[planKey];
  const tooSmall = activeSites > plan.maxActiveSites;
  return (
    <li className={`flex flex-col gap-2 border p-4 ${current ? "border-ink" : "border-border"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-base font-semibold">{plan.name}</h3>
        <span className="font-semibold tabular">
          ${plan.priceUsdMonthly}
          <span className="text-xs font-normal text-muted"> / month</span>
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
  prices: Record<PlanKey, string>;
  activeSites: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const paddle = useRef<Paddle | undefined>(undefined);
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
      items: [{ priceId: prices[planKey], quantity: 1 }],
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
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 tbl:grid-cols-3">
        {PLAN_ORDER.map((key) => (
          <PlanOption key={key} planKey={key} activeSites={activeSites}>
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
        Billed monthly in USD by Paddle, our reseller; tax is added at checkout where it applies. Cancel any time in the
        billing portal.
      </p>
    </div>
  );
}

/** Live subscription: switch plan with a prorated preview first. */
export function ChangePlan({ currentPlan, activeSites }: { currentPlan: PlanKey; activeSites: number }) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<PlanKey | null>(null);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(planKey: PlanKey) {
    setTarget(planKey);
    setPreview(null);
    setError(null);
    start(async () => {
      const r = await previewPlanChangeAction(planKey);
      if (!r.ok) return setError(r.error);
      setPreview(r.preview);
    });
  }

  function confirm() {
    if (!target) return;
    start(async () => {
      const r = await changePlanAction(target);
      if (!r.ok) return setError(r.error);
      toast.show(`Plan changed to ${PLANS[target].name}`);
      setTarget(null);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 tbl:grid-cols-3">
        {PLAN_ORDER.map((key) => (
          <PlanOption key={key} planKey={key} activeSites={activeSites} current={key === currentPlan}>
            {key === currentPlan ? (
              <span className="text-[13px] font-semibold">Current plan</span>
            ) : (
              <Button
                size="sm"
                variant={target === key ? "primary" : "secondary"}
                className="w-full"
                disabled={pending || activeSites > PLANS[key].maxActiveSites}
                onClick={() => pick(key)}
              >
                {PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan) ? "Upgrade" : "Downgrade"} to{" "}
                {PLANS[key].name}
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
                Switch to <b>{PLANS[target].name}</b> now.{" "}
                {preview.action === "charge"
                  ? `You’ll be charged ${money(preview.amount, preview.currency)} today for the rest of this billing period.`
                  : preview.action === "credit"
                    ? `${money(preview.amount, preview.currency)} is credited to your next invoices.`
                    : "Nothing is charged today."}
              </p>
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
