import Link from "next/link";
import { hasAccess } from "@/lib/billing/access";
import { formatLongDate } from "@/lib/format";
import { requireMembership } from "@/lib/session";
import { HideOnPath } from "./hide-on-path";

// Shown above every workspace page while there's a billing problem, so nobody
// mistakes stopped monitoring for "all clear". Billing has its own banner.

export async function BillingNotice() {
  const { workspace, role } = await requireMembership();
  const lapsed = !hasAccess(workspace.accessEndsAt);
  const pastDue = !lapsed && workspace.subscription?.status === "past_due";
  if (!lapsed && !pastDue) return null;
  const text = lapsed
    ? "Monitoring, alerts and new reports are stopped — this workspace has no active plan. Your data is kept."
    : `The last payment failed. Monitoring continues until ${formatLongDate(workspace.accessEndsAt!, workspace.timezone)} while Paddle retries.`;
  return (
    <HideOnPath path="/billing">
      <div
        role="alert"
        className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-7 py-2 text-[13px] ${
          lapsed ? "border-warn-border bg-warn-tint" : "border-down-border bg-down-tint"
        }`}
      >
        <span className={`font-semibold ${lapsed ? "text-degraded" : "text-down"}`}>
          <span aria-hidden="true">{lapsed ? "▲" : "◆"}</span> {lapsed ? "No active plan" : "Payment failed"}
        </span>
        <span className="flex-[1_1_320px] text-ink-2">{text}</span>
        <Link href="/billing" className="font-semibold">
          {role === "owner" ? (lapsed ? "Choose a plan" : "Update payment method") : "View billing"}
        </Link>
      </div>
    </HideOnPath>
  );
}
