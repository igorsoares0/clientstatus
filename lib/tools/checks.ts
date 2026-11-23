import { lookupDomainExpiry, type JsonFetcher } from "@/lib/monitoring/rdap";
import { SSL_THRESHOLD_DAYS, checkCertificate, type TlsOptions } from "@/lib/monitoring/tls-check";
import { normalizeSiteUrl } from "@/lib/url";

// The SSL and domain-expiry tools: one live check through the same code (and the same SSRF
// guards) the product uses, shaped for the tool page. Nothing is stored.

export type ParsedTarget = { ok: true; hostname: string; registrableDomain: string } | { ok: false; error: string };

/** Accepts "example.com", "https://www.example.com/page" etc. Private and local addresses are refused. */
export function parseTarget(raw: unknown): ParsedTarget {
  if (typeof raw !== "string") return { ok: false, error: "Enter a website address." };
  const res = normalizeSiteUrl(raw);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    hostname: new URL(res.value.baseUrl).hostname,
    registrableDomain: res.value.registrableDomain,
  };
}

export type SslToolResult = {
  hostname: string;
  state: "valid" | "expiring" | "expired" | "invalid" | "unknown";
  summary: string;
  issuer: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  /** Client Status warns at these days before expiry; the next one still ahead, if any. */
  nextWarningDays: number | null;
  thresholds: readonly number[];
};

export function nextWarning(daysLeft: number | null): number | null {
  if (daysLeft === null || daysLeft < 0) return null;
  // The largest threshold not yet passed, e.g. 20 days left → the 14-day warning is next.
  return SSL_THRESHOLD_DAYS.find((t) => t <= daysLeft) ?? null;
}

export async function runSslCheck(
  hostname: string,
  opts: Partial<TlsOptions> = {},
  now = new Date(),
): Promise<SslToolResult> {
  const r = await checkCertificate(hostname, { port: 443, timeoutMs: 10_000, ...opts }, now);
  const state: SslToolResult["state"] =
    r.status === "inconclusive"
      ? "unknown"
      : r.state === "expired" || r.state === "invalid"
        ? r.state
        : r.state === "expiring"
          ? "expiring"
          : "valid";
  return {
    hostname,
    state,
    summary: r.summary,
    issuer: r.issuer,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    daysLeft: r.daysLeft,
    nextWarningDays: state === "valid" || state === "expiring" ? nextWarning(r.daysLeft) : null,
    thresholds: SSL_THRESHOLD_DAYS,
  };
}

export type DomainToolResult = {
  domain: string;
  state: "ok" | "expiring" | "unsupported" | "unknown";
  summary: string;
  expiresAt: string | null;
  daysLeft: number | null;
  source: string | null;
};

export async function runDomainCheck(
  domain: string,
  fetchJson: JsonFetcher,
  now = new Date(),
): Promise<DomainToolResult> {
  const r = await lookupDomainExpiry(domain, fetchJson, now);
  const state: DomainToolResult["state"] =
    r.status === "inconclusive" ? "unknown" : r.state === "expiring" || r.state === "unsupported" ? r.state : "ok";
  return {
    domain,
    state,
    // The product's summaries say "will retry"; a one-off lookup doesn't.
    summary: r.summary.replace(/ — will retry$/, ". Try again in a minute."),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    daysLeft: r.daysLeft,
    source: r.source,
  };
}
