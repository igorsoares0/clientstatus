import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { emailDelivery, env } from "@/lib/env";
import { logger } from "@/lib/log";

const log = logger("email");

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** `<event-type>/<entity-id>` — prevents duplicate sends on retry. */
  idempotencyKey: string;
  attachments?: { filename: string; content: Buffer }[];
};

/** Where emails are written when EMAIL_DELIVERY is "mailbox". */
export const DEV_MAILBOX = path.join(process.cwd(), ".dev-mailbox", "emails.jsonl");

let resend: Resend | undefined;

/** Thrown for provider errors worth retrying (rate limits, outages). */
export class TemporaryEmailError extends Error {}

/** Sends one email. Returns the provider's message id (null in mailbox mode). */
export async function sendEmail(email: OutgoingEmail): Promise<{ providerMessageId: string | null }> {
  const config = env();

  if (emailDelivery(config) === "mailbox") {
    await mkdir(path.dirname(DEV_MAILBOX), { recursive: true });
    await appendFile(
      DEV_MAILBOX,
      JSON.stringify({
        sentAt: new Date().toISOString(),
        to: email.to,
        subject: email.subject,
        text: email.text,
        attachments: email.attachments?.map((a) => a.filename) ?? [],
      }) + "\n",
    );
    console.log(`\n[dev email] to ${email.to}: ${email.subject}\n${email.text}\n`);
    return { providerMessageId: null };
  }

  if (!config.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  resend ??= new Resend(config.RESEND_API_KEY);
  // The SDK returns { data, error } instead of throwing.
  const { data, error } = await resend.emails.send(
    {
      from: config.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    },
    { idempotencyKey: email.idempotencyKey },
  );
  if (error) {
    log.error("send failed", { subject: email.subject, error: error.message, name: error.name });
    const temporary = /rate|limit|internal|unavailable|timeout/i.test(`${error.name} ${error.message}`);
    throw temporary ? new TemporaryEmailError(error.message) : new Error(`Email could not be sent: ${error.message}`);
  }
  log.info("sent", { subject: email.subject, providerMessageId: data?.id });
  return { providerMessageId: data?.id ?? null };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain, accessible single-action email used for account flows. */
export function actionEmail(opts: { heading: string; body: string; actionLabel: string; url: string; footer: string }) {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.actionLabel}: ${opts.url}\n\n${opts.footer}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F4F5F3;font-family:Arial,sans-serif;color:#161A1C">
<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D5D8D4;padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(opts.body)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#161A1C;color:#FFFFFF;padding:10px 16px;text-decoration:none;font-weight:bold">${escapeHtml(opts.actionLabel)}</a></p>
<p style="margin:0;font-size:12px;color:#4A4F52;line-height:1.5">${escapeHtml(opts.footer)}<br>Link not working? Paste this into your browser:<br>${escapeHtml(opts.url)}</p>
</div></body></html>`;
  return { text, html };
}
