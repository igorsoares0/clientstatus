import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger("resend-webhook");

// Delivery events from Resend (svix-signed). Bounces and complaints mark the
// email and the client recipient, so reports show them and auto-send holds.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const payload = await req.text(); // raw body — required for signature verification
  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY || "re_unused").webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.type !== "email.bounced" && event.type !== "email.complained" && event.type !== "email.delivered") {
    return new Response("Ignored", { status: 200 });
  }
  const providerMessageId = event.data.email_id;
  const delivery = await db.emailDelivery.findUnique({
    where: { providerMessageId },
    select: { id: true, reportId: true, recipient: true },
  });
  if (!delivery) return new Response("Unknown email", { status: 200 });

  if (event.type === "email.bounced" || event.type === "email.complained") {
    await db.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "bounced", lastError: event.type === "email.bounced" ? "Bounced" : "Marked as spam" },
    });
    if (delivery.reportId) {
      const report = await db.monthlyReport.findUnique({
        where: { id: delivery.reportId },
        select: { clientId: true },
      });
      if (report) {
        await db.clientRecipient.updateMany({
          where: { clientId: report.clientId, email: delivery.recipient },
          data: { lastBouncedAt: new Date(event.created_at) },
        });
      }
    }
    log.warn("email bounced", { deliveryId: delivery.id, type: event.type });
  }
  return new Response("OK", { status: 200 });
}
