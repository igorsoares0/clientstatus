import type { PrismaClient } from "@/lib/generated/prisma/client";
import { hasAccess, isPaidSubscription } from "@/lib/billing/access";
import { UserFacingError } from "@/lib/data/errors";
import { lockWorkspace } from "@/lib/data/workspace-tx";
import { env } from "@/lib/env";
import { formatLongDate } from "@/lib/format";
import { getNotificationSettings } from "@/lib/notify/settings";
import { reportMail } from "@/lib/notify/templates";
import { getPlan } from "@/lib/plans";
import type { StoredReport } from "@/lib/reports/generate";
import { newReportToken, REPORT_TOKEN_PLACEHOLDER, sealReportToken } from "@/lib/reports/token";

// Report delivery (FR-REP-08/09, spec §9.6): recipients are confirmed once
// before automatic delivery; every send can include a private, expiring link.

const DAY_MS = 86_400_000;
/** Report emails a workspace without a paid subscription may queue per 24 hours. */
export const TRIAL_REPORT_EMAILS_PER_DAY = 25;
/** The same person gets the same report at most this often per 24 hours. */
const SENDS_PER_RECIPIENT_PER_DAY = 2;

/**
 * Daily cap on report emails, so the product can't be used to mass-mail arbitrary
 * addresses. Paid plans get room for a client per website, each with a full
 * recipient list (10), which covers the monthly run on the 1st.
 */
export function reportEmailsPerDay(planKey: string, paid: boolean): number {
  return paid ? getPlan(planKey).maxActiveSites * 10 : TRIAL_REPORT_EMAILS_PER_DAY;
}

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
      workspace: {
        select: {
          name: true,
          timezone: true,
          reportContact: true,
          accessEndsAt: true,
          planKey: true,
          subscription: { select: { status: true } },
        },
      },
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
  const linkTokenSealed = link ? sealReportToken(link.token, report.id) : null;
  const mail = reportMail({
    agencyName: report.workspace.name,
    clientName: report.client.name,
    periodLabel: report.periodLabel,
    summary: data.summary ?? [],
    // The stored body never holds the token: the worker swaps it in when sending (lib/notify/send.ts).
    linkUrl: link ? reportLinkUrl(REPORT_TOKEN_PLACEHOLDER) : null,
    linkExpires: linkExpiresAt ? formatLongDate(linkExpiresAt, report.workspace.timezone) : null,
    contact: report.workspace.reportContact,
  });

  const paid = isPaidSubscription(report.workspace.subscription?.status);
  const limit = reportEmailsPerDay(report.workspace.planKey, paid);

  const sent = await db.$transaction(async (tx) => {
    // Quotas are counted under the workspace lock, so parallel sends can't each see room left.
    await lockWorkspace(tx, report.workspaceId);
    const recent = { templateType: "report", scheduledAt: { gt: new Date(now.getTime() - DAY_MS) } };
    const today = await tx.emailDelivery.count({ where: { workspaceId: report.workspaceId, ...recent } });
    if (today + recipients.length > limit) {
      // Automatic sends wait for review instead; the team can send once the day's quota frees up.
      if (opts.automatic) return 0;
      throw new UserFacingError(
        paid
          ? `You’ve reached today’s limit of ${limit} report emails. Try again tomorrow.`
          : `Trial workspaces can send up to ${limit} report emails a day. Choose a plan in Billing to send more, or try again tomorrow.`,
        "rate_limited",
      );
    }
    const repeats = await tx.emailDelivery.groupBy({
      by: ["recipient"],
      where: { reportId: report.id, recipient: { in: recipients.map((r) => r.email) }, ...recent },
      _count: true,
    });
    const tooOften = repeats.find((r) => r._count >= SENDS_PER_RECIPIENT_PER_DAY);
    if (tooOften) {
      if (opts.automatic) return 0;
      throw new UserFacingError(
        `${tooOften.recipient} has already received this report twice today. Try again tomorrow.`,
        "rate_limited",
      );
    }

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
          linkTokenSealed,
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
  return { token: sent ? (link?.token ?? null) : null, sent };
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
