import { isIP } from "node:net";
import { checkServerIdentity, connect, type PeerCertificate } from "node:tls";
import { formatLongDate } from "@/lib/format";
import type { CheckStatus, SslState } from "@/lib/generated/prisma/enums";
import { guardedLookup } from "@/lib/monitoring/safe-fetch";
import { isPrivateIp } from "@/lib/url";
import type { LookupAddress } from "node:dns";

// SSL certificate check (FR-SSL-01..06): hostname match, chain trust and
// validity dates. Never reports success when the handshake or validation failed.

export const SSL_THRESHOLD_DAYS = [30, 14, 7, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CertFacts = {
  authorized: boolean;
  authorizationError: string | null;
  identityError: string | null;
  validFrom: Date;
  validTo: Date;
  issuer: string | null;
};

export type SslResult = {
  status: CheckStatus;
  state: SslState;
  expiresAt: Date | null;
  issuer: string | null;
  daysLeft: number | null;
  category: string | null;
  summary: string;
};

export function daysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS);
}

/** `timeZone` is the workspace's, so dates in summaries match the rest of the UI. */
export function evaluateCertificate(f: CertFacts, now: Date, timeZone = "UTC"): SslResult {
  const formatExpiry = (d: Date) => formatLongDate(d, timeZone);
  const base = { expiresAt: f.validTo, issuer: f.issuer };
  const daysLeft = daysUntil(f.validTo, now);
  if (f.authorizationError === "CERT_HAS_EXPIRED" || f.validTo.getTime() <= now.getTime()) {
    return {
      ...base,
      daysLeft,
      status: "failure",
      state: "expired",
      category: "expired",
      summary: `Certificate expired on ${formatExpiry(f.validTo)}`,
    };
  }
  if (f.validFrom.getTime() > now.getTime()) {
    return {
      ...base,
      daysLeft,
      status: "failure",
      state: "invalid",
      category: "not_yet_valid",
      summary: "Certificate isn’t valid yet",
    };
  }
  if (f.identityError) {
    return {
      ...base,
      daysLeft,
      status: "failure",
      state: "invalid",
      category: "hostname_mismatch",
      summary: "Certificate doesn’t match the hostname",
    };
  }
  if (!f.authorized) {
    const why =
      f.authorizationError === "DEPTH_ZERO_SELF_SIGNED_CERT" || f.authorizationError === "SELF_SIGNED_CERT_IN_CHAIN"
        ? "self-signed"
        : "untrusted chain";
    return {
      ...base,
      daysLeft,
      status: "failure",
      state: "invalid",
      category: "untrusted",
      summary: `Certificate isn’t trusted (${why})`,
    };
  }
  const by = f.issuer ? ` (${f.issuer})` : "";
  if (daysLeft <= SSL_THRESHOLD_DAYS[0]) {
    return {
      ...base,
      daysLeft,
      status: "success",
      state: "expiring",
      category: "expiring",
      summary: `Valid${by} · expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    };
  }
  return {
    ...base,
    daysLeft,
    status: "success",
    state: "valid",
    category: null,
    summary: `Valid${by} · ${daysLeft} days remaining`,
  };
}

function issuerName(cert: PeerCertificate): string | null {
  const i = cert.issuer as unknown as Record<string, string | string[]> | undefined;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return pick(i?.O) ?? pick(i?.CN) ?? null;
}

export type TlsOptions = {
  port?: number;
  timeoutMs: number;
  timeZone?: string;
  resolver?: (hostname: string) => Promise<LookupAddress[]>;
  allowPrivate?: boolean;
};

/** Connects and inspects the certificate. Network-level failures resolve as inconclusive. */
export function checkCertificate(hostname: string, opts: TlsOptions, now = new Date()): Promise<SslResult> {
  return new Promise((resolve) => {
    const inconclusive = (summary: string, category: string): SslResult => ({
      status: "inconclusive",
      state: "unknown",
      expiresAt: null,
      issuer: null,
      daysLeft: null,
      category,
      summary,
    });
    // IP literals never reach the socket lookup, so check them here (defence in depth:
    // site URLs with IP literals are already rejected at input).
    const literal = hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !opts.allowPrivate && isPrivateIp(literal)) {
      resolve({
        status: "failure",
        state: "invalid",
        expiresAt: null,
        issuer: null,
        daysLeft: null,
        category: "blocked",
        summary: "Resolves to a private or local address — blocked for safety",
      });
      return;
    }
    const socket = connect({
      host: hostname,
      port: opts.port ?? 443,
      servername: hostname,
      rejectUnauthorized: false,
      lookup: guardedLookup(opts.resolver, opts.allowPrivate),
      timeout: opts.timeoutMs,
    });
    let settled = false;
    const finish = (r: SslResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return finish(inconclusive("No certificate presented", "no_certificate"));
      const identity = checkServerIdentity(hostname, cert);
      finish(
        evaluateCertificate(
          {
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            identityError: identity ? identity.message : null,
            validFrom: new Date(cert.valid_from),
            validTo: new Date(cert.valid_to),
            issuer: issuerName(cert),
          },
          now,
          opts.timeZone,
        ),
      );
    });
    socket.once("timeout", () =>
      finish(inconclusive(`TLS connection timed out after ${Math.round(opts.timeoutMs / 1000)} s`, "timeout")),
    );
    socket.once("error", (err: NodeJS.ErrnoException) => {
      const code = err.code ?? err.name;
      if (err.name === "BlockedAddressError")
        return finish({
          ...inconclusive("Resolves to a private address — blocked", "blocked"),
          status: "failure",
          state: "invalid",
        });
      if (/^(ERR_TLS|ERR_SSL|EPROTO)/.test(code ?? "")) {
        return finish({
          status: "failure",
          state: "invalid",
          expiresAt: null,
          issuer: null,
          daysLeft: null,
          category: "handshake",
          summary: "TLS handshake failed",
        });
      }
      finish(inconclusive(`Couldn’t connect for the SSL check (${code})`, "network"));
    });
  });
}
