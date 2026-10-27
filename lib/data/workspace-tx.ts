import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { TenantContext } from "@/lib/data/tenant";

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Serialises plan-limited writes within one workspace for the rest of the
 * transaction, so two concurrent adds can't both take the last free slot.
 */
export async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
}

/** Audit trail entry. `metadata` must only hold allowlisted, non-sensitive values. */
export async function recordAudit(
  tx: Tx,
  ctx: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Prisma.InputJsonObject,
): Promise<void> {
  await tx.auditLog.create({
    data: { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action, resourceType, resourceId, metadata },
  });
}
