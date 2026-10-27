import type { WorkspaceRole } from "@/lib/generated/prisma/enums";

/**
 * Proof that the caller is a member of a workspace. Only `requireMembership()`
 * (lib/session.ts) builds one for request code; every workspace-owned query
 * takes it and filters by `workspaceId`, never by an id from the client.
 */
export type TenantContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

const RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

export class ForbiddenError extends Error {
  constructor(message = "You don’t have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws unless the caller's role is at least `minimum`. */
export function assertRole(ctx: TenantContext, minimum: WorkspaceRole): void {
  if (RANK[ctx.role] < RANK[minimum]) throw new ForbiddenError();
}
