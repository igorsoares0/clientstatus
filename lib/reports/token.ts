import { createHash, randomBytes } from "node:crypto";

// Private report links (FR-REP-09, spec §8.2): 256-bit random tokens; only a
// SHA-256 hash is stored, so a database leak doesn't expose working links.

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
