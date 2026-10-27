import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/data/tenant";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";

// Data Access Layer entry points. Authorization happens here, close to the
// data — proxy.ts only does an optimistic cookie check. React `cache` dedupes
// within one render; nothing is cached across requests, so a membership change
// is visible on the very next request.

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type CurrentUser = { id: string; name: string; email: string };

/** Signed-in, email-verified user, or a redirect to sign-in / verification. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { id, name, email, emailVerified } = session.user;
  if (!emailVerified) redirect(`/verify?email=${encodeURIComponent(email)}`);
  return { id, name, email };
});

export type WorkspaceSummary = {
  id: string;
  name: string;
  timezone: string;
  planKey: string;
  trialEndsAt: Date | null;
  accessEndsAt: Date | null;
  subscription: { status: SubscriptionStatus } | null;
};

export type Membership = TenantContext & {
  user: CurrentUser;
  workspace: WorkspaceSummary;
};

const getMembershipFor = cache(async (userId: string) =>
  db.workspaceMember.findUnique({
    where: { userId },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          timezone: true,
          planKey: true,
          trialEndsAt: true,
          accessEndsAt: true,
          subscription: { select: { status: true } },
        },
      },
    },
  }),
);

/** Current user's workspace membership. Users without a workspace finish onboarding first. */
export const requireMembership = cache(async (): Promise<Membership> => {
  const user = await requireUser();
  const membership = await getMembershipFor(user.id);
  if (!membership) redirect("/onboarding/workspace");
  return {
    userId: user.id,
    workspaceId: membership.workspace.id,
    role: membership.role,
    user,
    workspace: membership.workspace,
  };
});

/** For onboarding: returns the user's workspace id if they already have one. */
export async function findWorkspaceIdForUser(userId: string): Promise<string | null> {
  return (await getMembershipFor(userId))?.workspace.id ?? null;
}
