import type { Metadata } from "next";
import { Suspense } from "react";
import { NotYetAvailable, PageBody, PageHeader, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/data/workspace";
import { getPlan } from "@/lib/plans";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" />
      <PageBody>
        <Suspense fallback={<PanelSkeleton />}>
          <Members />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Members() {
  const ctx = await requireMembership();
  const members = await listMembers(db, ctx);
  const plan = getPlan(ctx.workspace.planKey);

  return (
    <section aria-labelledby="h-members" className="max-w-[820px] border border-border bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
        <h2 id="h-members" className="m-0 text-[15px] font-semibold">
          Members
        </h2>
        <span className="text-[12.5px] text-muted tabular">
          {members.length} of {plan.maxTeamMembers} on the {plan.name} plan
        </span>
        <span className="ml-auto">
          <NotYetAvailable>Invites arrive in a later release</NotYetAvailable>
        </span>
      </div>
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="text-left text-[11.5px] tracking-[.03em] text-muted uppercase">
            <th scope="col" className="px-4 py-2 font-normal">
              Name
            </th>
            <th scope="col" className="px-4 py-2 font-normal">
              Email
            </th>
            <th scope="col" className="px-4 py-2 font-normal">
              Role
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-rule">
              <td className="px-4 py-2.5 font-semibold">
                {m.user.name}
                {m.user.id === ctx.userId ? <span className="font-normal text-muted"> (you)</span> : null}
              </td>
              <td className="px-4 py-2.5 font-mono text-[12.5px]">{m.user.email}</td>
              <td className="px-4 py-2.5">{ROLE_LABEL[m.role]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
