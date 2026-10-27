import { signOutAction } from "@/app/(auth)/actions";
import { db } from "@/lib/db";
import { unacknowledgedCount } from "@/lib/data/incidents";
import { siteCounts } from "@/lib/data/sites";
import { getPlan } from "@/lib/plans";
import { requireMembership, type WorkspaceSummary } from "@/lib/session";
import { hasAccess } from "@/lib/billing/access";
import { SidebarLinks, TopBarLinks } from "./nav-links";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export async function Sidebar() {
  const ctx = await requireMembership();
  const { workspace, user, role } = ctx;
  const plan = getPlan(workspace.planKey);
  const [{ active }, unacknowledged] = await Promise.all([siteCounts(db, ctx), unacknowledgedCount(db, ctx)]);
  const line = planLine(workspace, plan.name, `${active} of ${plan.maxActiveSites} sites`);

  return (
    <>
      <nav
        aria-label="Primary"
        className="sticky top-0 hidden h-screen w-[200px] shrink-0 flex-col border-r border-border bg-surface py-4 nav:flex"
      >
        <div className="truncate px-4 pb-1 text-[17px] font-bold tracking-[.01em] font-stretch-80%">
          {workspace.name}
        </div>
        <div className={`px-4 pb-4 text-xs tabular ${line.alert ? "text-down" : "text-muted"}`}>{line.text}</div>
        <SidebarLinks unacknowledgedIncidents={unacknowledged} />
        <div className="mt-auto flex flex-col gap-0.5 border-t border-rule px-4 pt-3 text-[13px]">
          <span className="truncate font-semibold">{user.name}</span>
          <span className="text-xs text-muted">
            {ROLE_LABEL[role]} · {workspace.timezone}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="mt-1 border-0 bg-transparent p-0 text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
          <span className="mt-2 text-xs font-semibold tracking-[.02em] text-muted font-stretch-80%">Client Status</span>
        </div>
      </nav>

      <nav
        aria-label="Primary"
        className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 whitespace-nowrap nav:hidden"
      >
        <span className="mr-2 text-[15px] font-bold font-stretch-80%">{workspace.name}</span>
        <TopBarLinks />
        <form action={signOutAction} className="ml-auto pl-2">
          <button
            type="submit"
            className="border-0 bg-transparent p-0 text-[13px] text-muted underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </nav>
    </>
  );
}

/** Design: "Growth plan · 84 of 100 sites", with the billing problem appended when there is one. */
function planLine(workspace: WorkspaceSummary, planName: string, usage: string): { text: string; alert: boolean } {
  if (!hasAccess(workspace.accessEndsAt)) return { text: "No active plan · monitoring stopped", alert: true };
  const status = workspace.subscription?.status;
  if (status === "past_due") return { text: `${planName} plan · ${usage} · payment failed`, alert: true };
  const live = status === "active" || status === "trialing";
  return { text: `${planName} ${live ? "plan" : "trial"} · ${usage}`, alert: false };
}

export function SidebarFallback() {
  return (
    <>
      <div
        aria-hidden="true"
        className="sticky top-0 hidden h-screen w-[200px] shrink-0 border-r border-border bg-surface nav:block"
      />
      <div aria-hidden="true" className="h-[45px] border-b border-border bg-surface nav:hidden" />
    </>
  );
}
