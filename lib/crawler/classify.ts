import { STATUS_CODES } from "node:http";
import { BlockedAddressError, RedirectError } from "@/lib/monitoring/safe-fetch";

// Link outcome classification (spec §10.3). A failed link is never "broken"
// from a single request: 404/410 and dead hosts are retried once first.

export type LinkOutcome =
  | { kind: "valid"; status: number; redirects: number }
  | { kind: "broken"; status: number | null; reason: string }
  | { kind: "redirect_issue"; reason: string; redirects: number }
  | { kind: "inconclusive"; status: number | null; reason: string };

/** More hops than this is an "excessive redirect chain" (FR-CRAWL-14). */
export const MAX_REDIRECT_HOPS = 3;

function line(status: number) {
  const t = STATUS_CODES[status];
  return t ? `HTTP ${status} ${t}` : `HTTP ${status}`;
}

export function classifyLinkResponse(
  r: { status: number; redirects: number; botChallenge: boolean },
  internal: boolean,
): LinkOutcome {
  if (r.botChallenge) return { kind: "inconclusive", status: r.status, reason: "Bot challenge — couldn’t verify" };
  if (r.status === 429) return { kind: "inconclusive", status: 429, reason: "Rate-limited (HTTP 429)" };
  if (r.status === 404 || r.status === 410) return { kind: "broken", status: r.status, reason: line(r.status) };
  if (r.status === 401 || r.status === 403)
    return { kind: "inconclusive", status: r.status, reason: `${line(r.status)} — access restricted` };
  if (r.status >= 500) {
    // The agency's own server erroring is a real problem; other sites' 5xx is often bot blocking or a blip.
    return internal
      ? { kind: "broken", status: r.status, reason: line(r.status) }
      : { kind: "inconclusive", status: r.status, reason: line(r.status) };
  }
  if (r.status >= 400) return { kind: "broken", status: r.status, reason: line(r.status) };
  if (r.redirects > MAX_REDIRECT_HOPS)
    return { kind: "redirect_issue", reason: `${r.redirects} redirects before the final page`, redirects: r.redirects };
  return { kind: "valid", status: r.status, redirects: r.redirects };
}

function code(error: unknown): string {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const { code: c, name } = e as { code?: unknown; name?: string };
    if (name === "TimeoutError" || name === "AbortError") return name;
    if (typeof c === "string" && c) return c;
    e = (e as { cause?: unknown }).cause;
  }
  return (error as { name?: string })?.name ?? "UNKNOWN";
}

export function classifyLinkError(error: unknown): LinkOutcome {
  if (error instanceof RedirectError) {
    return error.kind === "loop"
      ? { kind: "redirect_issue", reason: "Redirect loop", redirects: 0 }
      : error.kind === "too_many"
        ? { kind: "redirect_issue", reason: error.message, redirects: 0 }
        : { kind: "broken", status: null, reason: "Redirects to an invalid address" };
  }
  if (error instanceof BlockedAddressError)
    return { kind: "inconclusive", status: null, reason: "Points to a private address — not checked" };
  const c = code(error);
  if (c === "ENOTFOUND") return { kind: "broken", status: null, reason: "Domain doesn’t resolve" };
  if (c === "ECONNREFUSED") return { kind: "broken", status: null, reason: "Connection refused" };
  return {
    kind: "inconclusive",
    status: null,
    reason: c.includes("TIMEOUT") || c === "TimeoutError" ? "Timed out" : `Network error (${c})`,
  };
}

/** Whether a first-request outcome deserves a retry before being called broken. */
export function shouldRetry(o: LinkOutcome): boolean {
  return o.kind === "broken";
}
