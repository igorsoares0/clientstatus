"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { addRecipient } from "@/lib/data/reports";
import { assertRole } from "@/lib/data/tenant";
import { LINK_EXPIRY_OPTIONS } from "@/lib/notify/settings";
import { requestPreview } from "@/lib/reports/schedule";
import { reportLinkUrl, revokeReportLink, rotateReportLink, sendReport } from "@/lib/reports/send";
import { requireMembership } from "@/lib/session";

const sendSchema = z.object({
  recipientIds: z.array(z.string()).max(10),
  confirmRecipients: z.boolean(),
  includeLink: z.boolean(),
  linkDays: z.number().refine((v) => (LINK_EXPIRY_OPTIONS as readonly number[]).includes(v)),
});

export async function sendReportAction(
  reportId: string,
  input: z.infer<typeof sendSchema>,
): Promise<ActionResult<{ link: string | null; sent: number }>> {
  const ctx = await requireMembership();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the recipients and link settings." };
  try {
    assertRole(ctx, "admin");
    const report = await db.monthlyReport.findFirst({
      where: { id: reportId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!report) return { ok: false, error: "That report doesn’t exist." };
    const { token, sent } = await sendReport(db, reportId, {
      now: () => new Date(),
      actorUserId: ctx.userId,
      ...parsed.data,
    });
    // No refresh here: the caller shows the one-time private link before moving to the sent view.
    return { ok: true, link: token ? reportLinkUrl(token) : null, sent };
  } catch (error) {
    return toActionError(error, "send report");
  }
}

export async function rotateLinkAction(reportId: string, days: number): Promise<ActionResult<{ link: string }>> {
  const ctx = await requireMembership();
  try {
    assertRole(ctx, "admin");
    const token = await rotateReportLink(
      db,
      reportId,
      ctx.workspaceId,
      (LINK_EXPIRY_OPTIONS as readonly number[]).includes(days) ? days : 30,
    );
    refresh();
    return { ok: true, link: reportLinkUrl(token) };
  } catch (error) {
    return toActionError(error, "create report link");
  }
}

export async function revokeLinkAction(reportId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    assertRole(ctx, "admin");
    await revokeReportLink(db, reportId, ctx.workspaceId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "revoke report link");
  }
}

export async function generatePreviewAction(clientId: string): Promise<ActionResult<{ reportId: string }>> {
  const ctx = await requireMembership();
  try {
    assertRole(ctx, "admin");
    const client = await db.client.findFirst({
      where: { id: clientId, workspaceId: ctx.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!client) return { ok: false, error: "That client doesn’t exist or is archived." };
    const report = await requestPreview(db, ctx.workspaceId, clientId);
    refresh();
    return { ok: true, reportId: report.id };
  } catch (error) {
    return toActionError(error, "generate preview");
  }
}

export async function retryReportAction(reportId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    assertRole(ctx, "admin");
    const { count } = await db.monthlyReport.updateMany({
      where: { id: reportId, workspaceId: ctx.workspaceId, status: "failed" },
      data: { status: "generating", errorSummary: null },
    });
    if (!count) return { ok: false, error: "Only failed reports can be retried." };
    await db.job.create({
      data: {
        workspaceId: ctx.workspaceId,
        jobType: "report_generate",
        resourceType: "report",
        resourceId: reportId,
        maxAttempts: 2,
        activeKey: `report_generate:${reportId}`,
      },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "retry report");
  }
}

export async function addRecipientAction(clientId: string, email: string, name: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = z.email("Enter a valid email address.").max(254).safeParse(email.trim());
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address.", field: "email" };
  try {
    await addRecipient(db, ctx, clientId, { email: parsed.data, name: name.slice(0, 120) });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "add recipient");
  }
}
