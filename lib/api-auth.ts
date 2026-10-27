import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/data/tenant";

/** Membership for API route handlers: returns null instead of redirecting. */
export async function apiMembership(headers: Headers): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user.emailVerified) return null;
  const m = await db.workspaceMember.findUnique({
    where: { userId: session.user.id },
    select: { workspaceId: true, role: true },
  });
  return m ? { userId: session.user.id, workspaceId: m.workspaceId, role: m.role } : null;
}
