import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// Private report links (FR-REP-09, spec §8.2): 256-bit random tokens; only a
// SHA-256 hash identifies the report, so a database leak doesn't expose working
// links. Queued emails need the token until they're sent: they hold a
// placeholder instead, and the token is kept sealed (AES-256-GCM) next to them.

export function newReportToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashReportToken(token) };
}

export function hashReportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Stands in for the token in stored email bodies; swapped for the real one at send time. */
export const REPORT_TOKEN_PLACEHOLDER = "__REPORT_LINK_TOKEN__";

/** Derived from the auth secret with its own label, so it is never the same key as anything else. */
function sealKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "clientstatus/report-link-token/v1", 32));
}

/** Encrypts a link token for one report (the report id is bound in, so it can't be moved to another). */
export function sealReportToken(token: string, reportId: string, secret = env().BETTER_AUTH_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret), iv);
  cipher.setAAD(Buffer.from(reportId));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws when the value was tampered with, belongs to another report, or the secret changed. */
export function openReportToken(sealed: string, reportId: string, secret = env().BETTER_AUTH_SECRET): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised sealed report token");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(reportId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
