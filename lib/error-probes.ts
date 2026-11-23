import { classifyLinkResponse } from "@/lib/crawler/classify";
import type { CheckStatus, DownPolicy } from "@/lib/generated/prisma/enums";
import { classifyError, classifyResponse } from "@/lib/monitoring/classify";
import { CONFIRM_FAILURES } from "@/lib/monitoring/decide";
import { RedirectError, type SafeFetchResult } from "@/lib/monitoring/safe-fetch";
import { evaluateCertificate, HANDSHAKE_FAILED } from "@/lib/monitoring/tls-check";

// The error glossary (/errors/[slug]) says how Client Status treats each error. Instead of
// restating the rules, each page runs the product's own classifiers on a simulated response, so
// the summary it shows is the one the app would record. tests/unit/errors.test.ts checks every
// page's expected outcome against these results, so a change in the classifiers fails the build
// until the copy is updated.

export type Probe =
  /** An uptime check that got an HTTP response. */
  | { check: "uptime"; status: number; challenge?: boolean; policy?: DownPolicy }
  /** An uptime check that failed before a response: a Node error code, or a redirect loop. */
  | { check: "uptime"; error: string; timeoutMs?: number }
  /** The SSL check, with one certificate problem. */
  | { check: "ssl"; problem: "expired" | "hostname" | "self-signed" | "untrusted-chain" | "handshake" }
  /** A link found by the weekly audit. */
  | { check: "audit"; status: number; internal: boolean };

export type ProbeResult = {
  check: Probe["check"];
  status: CheckStatus;
  /** What the app records, word for word. */
  summary: string;
  /** What happens next, in plain words. */
  effect: string;
};

export const CHECK_LABEL: Record<Probe["check"], string> = {
  uptime: "Uptime check",
  ssl: "SSL check",
  audit: "Weekly audit",
};

const DEFAULT_TIMEOUT_MS = 10_000;
const NOW = new Date("2026-11-22T12:00:00Z");
const DAY_MS = 86_400_000;

function response(status: number, challenge = false): SafeFetchResult {
  return {
    finalUrl: "https://www.example/",
    status,
    redirects: 0,
    durationMs: 840,
    headers: challenge ? { server: "cloudflare", cfMitigated: "challenge" } : {},
    bodySnippet: "",
  };
}

function nodeError(code: string): Error {
  if (code === "redirect-loop") return new RedirectError("Redirect loop", "loop");
  if (code === "TimeoutError") return new DOMException("The operation timed out.", "TimeoutError");
  return Object.assign(new Error(code), { code });
}

function certificate(problem: Exclude<Extract<Probe, { check: "ssl" }>["problem"], "handshake">) {
  return evaluateCertificate(
    {
      authorized: problem === "hostname",
      authorizationError:
        problem === "expired"
          ? "CERT_HAS_EXPIRED"
          : problem === "self-signed"
            ? "DEPTH_ZERO_SELF_SIGNED_CERT"
            : problem === "untrusted-chain"
              ? "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
              : null,
      identityError: problem === "hostname" ? "Hostname/IP does not match certificate's altnames" : null,
      validFrom: new Date(NOW.getTime() - 80 * DAY_MS),
      validTo: new Date(NOW.getTime() + (problem === "expired" ? -2 : 60) * DAY_MS),
      issuer: "Let's Encrypt",
    },
    NOW,
  );
}

function uptimeEffect(status: CheckStatus, policy: DownPolicy | undefined): string {
  if (status === "inconclusive")
    return "Inconclusive: left out of the uptime figure, and it never opens an incident on its own.";
  if (status === "failure") {
    const rule = `A failed check; ${CONFIRM_FAILURES} failed checks in a row open a downtime incident and email your team.`;
    return policy === "non_success" ? `Only on sites set to count any error as down. ${rule}` : rule;
  }
  return policy === undefined
    ? "Counts as up: the uptime check doesn’t judge the certificate."
    : "Recorded and shown on the site, but not counted as down (the default setting).";
}

export function runProbe(p: Probe): ProbeResult {
  switch (p.check) {
    case "uptime": {
      if ("error" in p) {
        const r = classifyError(nodeError(p.error), p.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        return {
          check: "uptime",
          status: r.status,
          summary: r.summary,
          effect: uptimeEffect(r.status, "server_errors"),
        };
      }
      const r = classifyResponse(response(p.status, p.challenge), p.policy ?? "server_errors");
      const effect =
        r.status === "success" && r.category === null
          ? uptimeEffect("success", undefined)
          : uptimeEffect(r.status, p.policy ?? "server_errors");
      return { check: "uptime", status: r.status, summary: r.summary, effect };
    }
    case "ssl": {
      const r = p.problem === "handshake" ? HANDSHAKE_FAILED : certificate(p.problem);
      return {
        check: "ssl",
        status: r.status,
        summary: r.summary,
        effect:
          r.status === "failure"
            ? `Opens an SSL incident (${r.state === "expired" ? "critical" : "high"} severity) and emails your team.`
            : "No incident.",
      };
    }
    case "audit": {
      const o = classifyLinkResponse({ status: p.status, redirects: 0, botChallenge: false }, p.internal);
      const status: CheckStatus =
        o.kind === "broken" ? "failure" : o.kind === "inconclusive" ? "inconclusive" : "success";
      return {
        check: "audit",
        status,
        summary: "reason" in o ? `${p.internal ? "Internal" : "External"} link — ${o.reason}` : "Link works",
        effect:
          status === "failure"
            ? p.internal
              ? "Reported as a broken link once a second request fails the same way; broken internal links also open an incident."
              : "Reported as a broken link once a second request fails the same way."
            : status === "inconclusive"
              ? "Not reported as broken: the audit can’t tell, so it counts the link as inconclusive."
              : "No finding.",
      };
    }
  }
}
