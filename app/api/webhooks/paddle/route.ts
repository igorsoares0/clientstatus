import type { NextRequest } from "next/server";
import { processWebhookEvent } from "@/lib/billing/apply";
import { billingConfig } from "@/lib/billing/config";
import { verifySignature, webhookEvent } from "@/lib/billing/paddle";
import { db } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger("paddle-webhook");

// Paddle notifications (FR-BILL-01/08). Signature first, then idempotent
// processing. A 5xx makes Paddle retry, so only unexpected errors return one.
export async function POST(req: NextRequest) {
  const config = billingConfig();
  if (!config) return new Response("Billing not configured", { status: 503 });
  const raw = await req.text(); // raw body — required for signature verification
  const verified = verifySignature(raw, req.headers.get("paddle-signature"), config.webhookSecret);
  if (!verified.ok) {
    log.warn("rejected webhook", { reason: verified.reason });
    return new Response("Invalid signature", { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const event = webhookEvent.safeParse(json);
  if (!event.success) return new Response("Invalid event", { status: 400 });
  try {
    const outcome = await processWebhookEvent(db, event.data, config);
    log.info("webhook processed", { eventId: event.data.event_id, type: event.data.event_type, outcome });
    return new Response(outcome, { status: 200 });
  } catch (error) {
    log.error("webhook processing failed", { eventId: event.data.event_id, type: event.data.event_type, error });
    return new Response("Processing failed", { status: 500 });
  }
}
