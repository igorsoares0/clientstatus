import type { PrismaClient } from "@/lib/generated/prisma/client";
import { hasAccess } from "@/lib/billing/access";
import { UserFacingError } from "@/lib/data/errors";
import { env } from "@/lib/env";
import { formatLongDate } from "@/lib/format";
import { getNotificationSettings } from "@/lib/notify/settings";
import { reportMail } from "@/lib/notify/templates";
import type { StoredReport } from "@/lib/reports/generate";
import { newReportToken } from "@/lib/reports/token";

// Report delivery (FR-REP-08/09, spec §9.6): recipients are confirmed once
// before automatic delivery; every send can include a private, expiring link.

export type SendOptions = {
  now: () => Date;
  automatic?: boolean;
  actorUserId?: string;
  /** Manual sends: which client recipients get it. */
  recipientIds?: string[];
  /** Manual sends: the reviewer confirmed these are the right people. */
  confirmRecipients?: boolean;
  includeLink?: boolean;
  linkDays?: number;
};

function fileName(client: string, period: string) {
  const slug = `${client} ${period}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "report"}-website-health.pdf`;
}

export function reportLinkUrl(token: string) {
  return `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/r/${token}`;
}

/** Returns the new private link token (shown once — only its hash is stored), or null. */
export async function sendReport(
  db: PrismaClient,
  reportId: string,
  opts: SendOptions,
): Promise<{ token: string | null; sent: number }> {
  const now = opts.now();
  const report = await db.monthlyReport.findUnique({
    where: { id: reportId },
    include: {
      client: { select: { id: true, name: true, status: true } },
      workspace: { select: { name: true, timezone: true, reportContact: true, accessEndsAt: true } },
    },
  });
  if (!report || !report.storageKey || !report.data)
    throw new UserFacingError("This report isn’t ready to send.", "invalid");
  if (report.status !== "needs_review" && report.status !== "sent")
    throw new UserFacingError("This report isn’t ready to send.", "invalid");
  if (report.client.status === "archived") throw new UserFacingError("The client is archived.", "invalid");

  const all = await db.clientRecipient.findMany({ where: { clientId: report.clientId } });
  let recipients = all;
  if (opts.automatic) {
    // Automatic sends never go out with gaps, unconfirmed or bouncing recipients — they wait for review.
    if (report.kind !== "monthly" || report.status !== "needs_review" || report.disclosures.length)
      return { token: null, sent: 0 };
    if (!hasAccess(report.workspace.accessEndsAt, now)) return { token: null, sent: 0 };
    if (!all.length || all.some((r) => !r.confirmedAt || r.lastBouncedAt)) return { token: null, sent: 0 };
  } else {
    recipients = all.filter((r) => opts.recipientIds?.includes(r.id));
    if (!recipients.length) throw new UserFacingError("Choose at least one recipient.", "invalid");
    if (recipients.some((r) => !r.confirmedAt) && !opts.confirmRecipients) {
      throw new UserFacingError("Confirm the recipients before the first delivery.", "invalid");
    }
  }

  const settings = await getNotificationSettings(db, report.workspaceId);
  const includeLink = opts.includeLink ?? true;
  const linkDays = opts.linkDays ?? settings.linkExpiryDays;
  const link = includeLink ? newReportToken() : null;
  const linkExpiresAt = link ? new Date(now.getTime() + linkDays * 86_400_000) : null;
  const data = report.data as unknown as StoredReport;
  const mail = reportMail({
    agencyName: report.workspace.name,
    clientName: report.client.name,
    periodLabel: report.periodLabel,
    summary: data.summary ?? [],
    linkUrl: link ? reportLinkUrl(link.token) : null,
    linkExpires: linkExpiresAt ? formatLongDate(linkExpiresAt, report.workspace.timezone) : null,
    contact: report.workspace.reportContact,
  });

  const sent = await db.$transaction(async (tx) => {
    if (opts.confirmRecipients) {
      await tx.clientRecipient.updateMany({
        where: { id: { in: recipients.map((r) => r.id) }, confirmedAt: null },
        data: { confirmedAt: now },
      });
    }
    for (const r of recipients) {
      const delivery = await tx.emailDelivery.create({
        data: {
          workspaceId: report.workspaceId,
          recipient: r.email,
          templateType: "report",
          deduplicationKey: `report:${report.id}:${r.email}:${now.getTime()}`,
          subject: mail.subject,
          textBody: mail.text,
          htmlBody: mail.html,
          attachmentKey: report.storageKey,
          attachmentName: fileName(report.client.name, report.periodLabel),
          reportId: report.id,
          scheduledAt: now,
        },
      });
      await tx.reportDelivery.create({
        data: { workspaceId: report.workspaceId, reportId: report.id, email: r.email, emailDeliveryId: delivery.id },
      });
      await tx.job.create({
        data: {
          workspaceId: report.workspaceId,
          jobType: "email_send",
          resourceType: "email",
          resourceId: delivery.id,
          priority: 6,
          runAt: now,
          maxAttempts: 5,
          activeKey: `email_send:${delivery.id}`,
        },
      });
    }
    await tx.monthlyReport.update({
      where: { id: report.id },
      data: {
        status: "sent",
        sentAt: now,
        sentById: opts.actorUserId ?? null,
        ...(link ? { privateTokenHash: link.hash, linkExpiresAt, linkRevokedAt: null } : {}),
      },
    });
    return recipients.length;
  });
  return { token: link?.token ?? null, sent };
}

/** Replaces the private link with a new one (the old one stops working). Returns the token, shown once. */
export async function rotateReportLink(
  db: PrismaClient,
  reportId: string,
  workspaceId: string,
  days: number,
  now = new Date(),
) {
  const link = newReportToken();
  const { count } = await db.monthlyReport.updateMany({
    where: { id: reportId, workspaceId, status: "sent" },
    data: {
      privateTokenHash: link.hash,
      linkExpiresAt: new Date(now.getTime() + days * 86_400_000),
      linkRevokedAt: null,
    },
  });
  if (!count) throw new UserFacingError("Links can only be created for sent reports.", "invalid");
  return link.token;
}

export async function revokeReportLink(db: PrismaClient, reportId: string, workspaceId: string, now = new Date()) {
  const { count } = await db.monthlyReport.updateMany({
    where: { id: reportId, workspaceId, privateTokenHash: { not: null } },
    data: { linkRevokedAt: now },
  });
  if (!count) throw new UserFacingError("There’s no active link to revoke.", "invalid");
}
