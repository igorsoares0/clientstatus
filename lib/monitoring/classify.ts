import { STATUS_CODES } from "node:http";
import type { CheckStatus, DownPolicy } from "@/lib/generated/prisma/enums";
import { BlockedAddressError, RedirectError, type SafeFetchResult } from "@/lib/monitoring/safe-fetch";

// Turns one uptime request into a check result (FR-UP-02, FR-UP-08).
// Design rule: timeouts, 429s and bot challenges are inconclusive — excluded
// from uptime and never alert on their own.

/** Successful responses at or above this are "slow" and make a site Degraded. */
export const SLOW_RESPONSE_MS = 3000;

export type UptimeResult = {
  status: CheckStatus;
  category: string | null;
  summary: string;
  httpStatus: number | null;
  durationMs: number | null;
  slow: boolean;
};

function statusLine(code: number) {
  const text = STATUS_CODES[code];
  return text ? `HTTP ${code} ${text}` : `HTTP ${code}`;
}

export function isBotChallenge(r: SafeFetchResult): boolean {
  if (r.headers.cfMitigated === "challenge") return true;
  if (r.status !== 403 && r.status !== 503) return false;
  const body = r.bodySnippet.slice(0, 16_384).toLowerCase();
  return (
    ((r.headers.server?.includes("cloudflare") ?? false) &&
      (body.includes("cf-chl") || body.includes("just a moment"))) ||
    body.includes("captcha") ||
    body.includes("are you a robot")
  );
}

export function classifyResponse(r: SafeFetchResult, policy: DownPolicy): UptimeResult {
  const base = { httpStatus: r.status, durationMs: r.durationMs };
  const ms = `${r.durationMs.toLocaleString("en-GB")} ms`;
  if (r.status === 429) {
    return {
      ...base,
      status: "inconclusive",
      category: "rate_limited",
      summary: `HTTP 429 rate-limited · ${ms} — excluded from uptime`,
      slow: false,
    };
  }
  if (isBotChallenge(r)) {
    return {
      ...base,
      status: "inconclusive",
      category: "bot_challenge",
      summary: `Bot challenge (HTTP ${r.status}) — excluded from uptime`,
      slow: false,
    };
  }
  if (r.status >= 500) {
    return {
      ...base,
      status: "failure",
      category: "http_5xx",
      summary: `${statusLine(r.status)} · ${ms}`,
      slow: false,
    };
  }
  if (r.status >= 400) {
    return policy === "non_success"
      ? { ...base, status: "failure", category: "http_4xx", summary: `${statusLine(r.status)} · ${ms}`, slow: false }
      : {
          ...base,
          status: "success",
          category: "http_4xx",
          summary: `${statusLine(r.status)} · ${ms} — recorded, not counted as down`,
          slow: false,
        };
  }
  const slow = r.durationMs >= SLOW_RESPONSE_MS;
  return {
    ...base,
    status: "success",
    category: slow ? "slow" : null,
    summary: `${statusLine(r.status)} · ${ms}`,
    slow,
  };
}

/** First string error code in the cause chain. DOMException (abort/timeout) has a numeric code, so use its name. */
function errorCode(error: unknown): string {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const { code, name } = e as { code?: unknown; name?: string };
    if (name === "TimeoutError" || name === "AbortError") return name;
    if (typeof code === "string" && code) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return (error as { name?: string })?.name ?? "UNKNOWN";
}

export function classifyError(error: unknown, timeoutMs: number): UptimeResult {
  const base = { httpStatus: null, durationMs: null, slow: false };
  if (error instanceof BlockedAddressError) {
    return {
      ...base,
      status: "failure",
      category: "blocked",
      summary: "Resolves to a private or local address — blocked for safety",
    };
  }
  if (error instanceof RedirectError) {
    return {
      ...base,
      status: "failure",
      category: "redirect",
      summary: error.kind === "loop" ? "Redirect loop" : error.message,
    };
  }
  const code = errorCode(error);
  const seconds = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`;
  if (
    [
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
      "TimeoutError",
      "AbortError",
      "ETIMEDOUT",
    ].includes(code)
  ) {
    return {
      ...base,
      status: "inconclusive",
      category: "timeout",
      summary: `Timed out after ${seconds} — excluded from failure count`,
    };
  }
  if (code === "ENOTFOUND")
    return { ...base, status: "failure", category: "dns", summary: "Domain doesn’t resolve (DNS lookup failed)" };
  if (code === "EAI_AGAIN")
    return {
      ...base,
      status: "inconclusive",
      category: "dns_temporary",
      summary: "Temporary DNS failure — excluded from failure count",
    };
  if (code === "ECONNREFUSED")
    return { ...base, status: "failure", category: "connection_refused", summary: "Connection refused" };
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET")
    return { ...base, status: "failure", category: "connection_reset", summary: "Connection reset by the server" };
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH")
    return { ...base, status: "failure", category: "unreachable", summary: "Host unreachable" };
  if (/^(ERR_TLS|ERR_SSL|EPROTO)/.test(code))
    return { ...base, status: "failure", category: "tls", summary: "TLS handshake failed" };
  return {
    ...base,
    status: "inconclusive",
    category: "network",
    summary: `Network error (${code}) — excluded from failure count`,
  };
}
