import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/lib/plans";
import { slugify } from "@/lib/validation";
import type { TenantContext } from "@/lib/data/tenant";

// Workspace-scoped data access. Takes the Prisma client as a parameter so
// integration tests can run against the test database.

export class AlreadyInWorkspaceError extends Error {
  constructor() {
    super("This account already belongs to a workspace.");
    this.name = "AlreadyInWorkspaceError";
  }
}

export async function createWorkspaceForUser(
  db: PrismaClient,
  userId: string,
  input: { name: string; timezone: string },
  now = new Date(),
): Promise<{ workspaceId: string }> {
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const baseSlug = slugify(input.name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    try {
      return await db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: input.name, slug, timezone: input.timezone, planKey: TRIAL_PLAN, trialEndsAt },
          select: { id: true },
        });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "owner" } });
        await tx.auditLog.create({
          data: {
            workspaceId: workspace.id,
            actorUserId: userId,
            action: "workspace.created",
            resourceType: "workspace",
            resourceId: workspace.id,
            metadata: { timezone: input.timezone, planKey: TRIAL_PLAN },
          },
        });
        return { workspaceId: workspace.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = String(error.meta?.target ?? "") + JSON.stringify(error.meta ?? {});
        if (target.includes("user")) throw new AlreadyInWorkspaceError();
        if (target.includes("slug")) continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique workspace slug");
}

export async function listMembers(db: PrismaClient, ctx: TenantContext) {
  return db.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listAuditLog(db: PrismaClient, ctx: TenantContext, take = 50) {
  return db.auditLog.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, action: true, resourceType: true, resourceId: true, actorUserId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  });
}

export async function countMembers(db: PrismaClient, ctx: TenantContext): Promise<number> {
  return db.workspaceMember.count({ where: { workspaceId: ctx.workspaceId } });
}
