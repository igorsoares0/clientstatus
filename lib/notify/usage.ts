import type { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";
import { usageMail } from "@/lib/notify/templates";
import { getPlan } from "@/lib/plans";

// Design "Billing": "We email owners at 90 sites". Called after anything that
// adds active websites; at most one email per owner, plan and calendar month.

export const USAGE_WARNING_RATIO = 0.9;

export async function warnIfNearPlanLimit(db: PrismaClient, workspaceId: string, now = new Date()): Promise<number> {
  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { name: true, planKey: true },
  });
  const plan = getPlan(ws.planKey);
  const active = await db.site.count({ where: { workspaceId, status: "active" } });
  if (active < Math.ceil(plan.maxActiveSites * USAGE_WARNING_RATIO)) return 0;

  const owners = await db.workspaceMember.findMany({
    where: { workspaceId, role: "owner", user: { emailVerified: true } },
    select: { user: { select: { id: true, email: true } } },
  });
  const month = now.toISOString().slice(0, 7);
  const mail = usageMail({
    workspaceName: ws.name,
    planName: plan.name,
    active,
    max: plan.maxActiveSites,
    url: `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/billing`,
  });
  let queued = 0;
  for (const { user } of owners) {
    const created = await db.$transaction(async (tx) => {
      const key = `usage:${workspaceId}:${plan.key}:${month}:${user.id}`;
      if (await tx.emailDelivery.findUnique({ where: { deduplicationKey: key }, select: { id: true } })) return false;
      const delivery = await tx.emailDelivery.create({
        data: {
          workspaceId,
          recipient: user.email,
          templateType: "plan_usage",
          deduplicationKey: key,
          subject: mail.subject,
          textBody: mail.text,
          htmlBody: mail.html,
          scheduledAt: now,
        },
        select: { id: true },
      });
      await tx.job.create({
        data: {
          workspaceId,
          jobType: "email_send",
          resourceType: "email",
          resourceId: delivery.id,
          priority: 4,
          runAt: now,
          maxAttempts: 5,
          activeKey: `email_send:${delivery.id}`,
        },
      });
      return true;
    });
    if (created) queued++;
  }
  return queued;
}
