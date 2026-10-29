import type { PrismaClient } from "@/lib/generated/prisma/client";
import { sendEmail } from "@/lib/email";
import { sanitizeError } from "@/lib/jobs/queue";
import { openReportToken, REPORT_TOKEN_PLACEHOLDER } from "@/lib/reports/token";
import { getObject } from "@/lib/storage";

// Sends one queued email. Provider errors throw so the job queue retries with
// backoff (FR-NOT-04); the delivery row records attempts and the last error.

export async function sendQueuedEmail(db: PrismaClient, deliveryId: string, now = new Date()) {
  const d = await db.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.status !== "pending") return;

  // An incident muted after the email was queued: don't send (except recovery news).
  if (d.incidentId && d.templateType !== "incident_resolved") {
    const incident = await db.incident.findUnique({ where: { id: d.incidentId }, select: { status: true } });
    if (incident?.status === "muted") {
      await db.emailDelivery.update({
        where: { id: d.id },
        data: { status: "suppressed", lastError: "Incident muted before sending" },
      });
      return;
    }
  }

  // Report links: the token exists only sealed, and only until the email is sent.
  let { textBody, htmlBody } = d;
  if (d.linkTokenSealed) {
    if (!d.reportId) throw new Error("Sealed report link without a report");
    const token = openReportToken(d.linkTokenSealed, d.reportId);
    textBody = textBody.replaceAll(REPORT_TOKEN_PLACEHOLDER, token);
    htmlBody = htmlBody.replaceAll(REPORT_TOKEN_PLACEHOLDER, token);
  }

  const attachments = d.attachmentKey
    ? [{ filename: d.attachmentName ?? "report.pdf", content: await getObject(d.attachmentKey) }]
    : undefined;
  try {
    const { providerMessageId } = await sendEmail({
      to: d.recipient,
      subject: d.subject,
      text: textBody,
      html: htmlBody,
      idempotencyKey: `delivery/${d.id}`,
      attachments,
    });
    await db.emailDelivery.update({
      where: { id: d.id },
      data: {
        status: "sent",
        sentAt: now,
        providerMessageId,
        attempts: { increment: 1 },
        lastError: null,
        linkTokenSealed: null,
      },
    });
  } catch (error) {
    await db.emailDelivery.update({
      where: { id: d.id },
      data: { attempts: { increment: 1 }, lastError: sanitizeError(error) },
    });
    throw error;
  }
}

/** Called when the job queue gives up on an email. */
export async function markEmailFailed(db: PrismaClient, deliveryId: string) {
  await db.emailDelivery.updateMany({ where: { id: deliveryId, status: "pending" }, data: { status: "failed" } });
}
