import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@/lib/db";
import type { TenantContext } from "@/lib/data/tenant";
import { createWorkspaceForUser } from "@/lib/data/workspace";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";

export const db = createPrismaClient(process.env.TEST_DATABASE_URL!);

export async function resetDb() {
  await db.$executeRawUnsafe(
    'TRUNCATE "billing_event", "billing_transaction", "subscription", "report_delivery", "monthly_report", "client_recipient", "email_delivery", "notification_settings", "job", "audit_finding", "audit_run", "incident_event", "incident", "monitor_check", "site_state", "site", "client", "audit_log", "workspace_member", "workspace", "session", "account", "verification", "user", "rate_limit_bucket" CASCADE',
  );
}

export async function createUser(name: string) {
  return db.user.create({
    data: { id: randomUUID(), name, email: `${name.toLowerCase()}-${randomUUID()}@example.com`, emailVerified: true },
  });
}

export async function contextFor(userId: string): Promise<TenantContext> {
  const m = await db.workspaceMember.findUniqueOrThrow({ where: { userId } });
  return { userId, workspaceId: m.workspaceId, role: m.role };
}

/** A workspace with an owner; optionally on a different plan. */
export async function workspaceWithOwner(name = "Owner", planKey?: string): Promise<TenantContext> {
  const user = await createUser(name);
  const { workspaceId } = await createWorkspaceForUser(db, user.id, { name: `${name} Agency`, timezone: "UTC" });
  if (planKey) await db.workspace.update({ where: { id: workspaceId }, data: { planKey } });
  return contextFor(user.id);
}

/** Adds another member with the given role to an existing workspace. */
export async function addMember(ctx: TenantContext, role: WorkspaceRole, name: string = role): Promise<TenantContext> {
  const user = await createUser(name);
  await db.workspaceMember.create({ data: { workspaceId: ctx.workspaceId, userId: user.id, role } });
  return { userId: user.id, workspaceId: ctx.workspaceId, role };
}
