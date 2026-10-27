import type { Metadata } from "next";
import { Suspense } from "react";
import { NotYetAvailable, PageBody, PageHeader, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { siteCounts } from "@/lib/data/sites";
import { getPlan } from "@/lib/plans";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Billing" };

const dateFormat = (tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" />
      <PageBody>
        <Suspense fallback={<PanelSkeleton />}>
          <PlanCard />
        </Suspense>
      </PageBody>
    </>
  );
}

async function PlanCard() {
  const ctx = await requireMembership();
  const { workspace } = ctx;
  const plan = getPlan(workspace.planKey);
  const counts = await siteCounts(db, ctx);
  const now = new Date();
  const trialEnds = workspace.trialEndsAt;
  const onTrial = trialEnds !== null && trialEnds > now;

  return (
    <section aria-labelledby="h-plan" className="max-w-[820px] border border-border bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-rule p-4">
        <h2 id="h-plan" className="m-0 text-xl font-semibold font-stretch-85%">
          {plan.name} plan
        </h2>
        {onTrial ? (
          <>
            <span className="border border-warn-border px-2 py-px font-semibold text-degraded">Trial</span>
            <span className="text-[13px] text-muted">
              Ends {dateFormat(workspace.timezone).format(trialEnds)} · no card on file
            </span>
          </>
        ) : null}
        <span className="ml-auto text-lg font-semibold font-stretch-88% tabular">
          ${plan.priceUsdMonthly} <span className="text-[13px] font-normal text-muted">/ month, billed monthly</span>
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 px-4 py-3.5 text-[13.5px] tabular">
        <dt className="text-muted">Active websites</dt>
        <dd className="m-0">
          {counts.active} of {plan.maxActiveSites}
          {counts.paused ? <span className="text-muted"> · + {counts.paused} paused (don’t count)</span> : null}
        </dd>
        <dt className="text-muted">Uptime checks</dt>
        <dd className="m-0">Every {plan.uptimeIntervalSeconds / 60} min</dd>
        <dt className="text-muted">Team members</dt>
        <dd className="m-0">Up to {plan.maxTeamMembers}</dd>
      </dl>
      <div className="border-t border-rule px-4 py-3">
        <NotYetAvailable>Checkout, invoices and the Paddle billing portal arrive in a later release.</NotYetAvailable>
      </div>
    </section>
  );
}
