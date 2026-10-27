import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Checkout custom data is set in the browser, so the workspace id in it is
// signed: a buyer can't attach a subscription to someone else's workspace.

function sign(workspaceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`paddle-checkout:${workspaceId}`).digest("base64url");
}

export type CheckoutCustomData = { workspace_id: string; workspace_sig: string };

export function checkoutCustomData(workspaceId: string, secret = env().BETTER_AUTH_SECRET): CheckoutCustomData {
  return { workspace_id: workspaceId, workspace_sig: sign(workspaceId, secret) };
}

/** The workspace id from Paddle custom data, if its signature is valid. */
export function workspaceFromCustomData(
  data: Record<string, unknown> | null | undefined,
  secret = env().BETTER_AUTH_SECRET,
): string | null {
  const id = data?.workspace_id;
  const sig = data?.workspace_sig;
  if (typeof id !== "string" || typeof sig !== "string") return null;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
