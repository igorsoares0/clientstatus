import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextRegularCheck } from "@/lib/monitoring/apply";
import { classifyError, classifyResponse, SLOW_RESPONSE_MS, type UptimeResult } from "@/lib/monitoring/classify";
import { decideUptime, expirySeverity, jitterFor, nextSweep, type UptimeCounters } from "@/lib/monitoring/decide";
import { parseBootstrap, parseRdapDomain, rdapServerFor } from "@/lib/monitoring/rdap";
import { BlockedAddressError, RedirectError, type SafeFetchResult } from "@/lib/monitoring/safe-fetch";
import { evaluateCertificate } from "@/lib/monitoring/tls-check";
import { computeUptime, formatPercent } from "@/lib/monitoring/uptime";

const res = (status: number, extra: Partial<SafeFetchResult> = {}): SafeFetchResult => ({
  finalUrl: "https://example.com/",
  status,
  redirects: 0,
  durationMs: 250,
  headers: {},
  bodySnippet: "",
  ...extra,
});

describe("classifyResponse", () => {
  it("treats 2xx/3xx as up and slow responses as degraded", () => {
    expect(classifyResponse(res(200), "server_errors")).toMatchObject({
      status: "success",
      slow: false,
      summary: "HTTP 200 OK · 250 ms",
    });
    expect(classifyResponse(res(200, { durationMs: SLOW_RESPONSE_MS }), "server_errors")).toMatchObject({
      status: "success",
      slow: true,
    });
  });

  it("fails on 5xx and applies the down policy to 4xx", () => {
    expect(classifyResponse(res(502), "server_errors")).toMatchObject({
      status: "failure",
      category: "http_5xx",
      summary: "HTTP 502 Bad Gateway · 250 ms",
    });
    expect(classifyResponse(res(404), "server_errors")).toMatchObject({ status: "success", category: "http_4xx" });
    expect(classifyResponse(res(404), "non_success")).toMatchObject({ status: "failure", category: "http_4xx" });
  });

  it("marks rate limits and bot challenges inconclusive", () => {
    expect(classifyResponse(res(429), "non_success").status).toBe("inconclusive");
    expect(classifyResponse(res(403, { headers: { cfMitigated: "challenge" } }), "non_success").category).toBe(
      "bot_challenge",
    );
    expect(
      classifyResponse(
        res(503, { headers: { server: "cloudflare" }, bodySnippet: "<title>Just a moment...</title>" }),
        "server_errors",
      ).status,
    ).toBe("inconclusive");
  });
});

describe("classifyError", () => {
  const err = (code: string) => Object.assign(new Error(code), { code });
  it("maps network failures", () => {
    expect(classifyError(err("ECONNREFUSED"), 10000)).toMatchObject({
      status: "failure",
      summary: "Connection refused",
    });
    expect(classifyError(err("ENOTFOUND"), 10000)).toMatchObject({ status: "failure", category: "dns" });
    expect(classifyError(new BlockedAddressError("x"), 10000)).toMatchObject({
      status: "failure",
      category: "blocked",
    });
    expect(classifyError(new RedirectError("loop", "loop"), 10000)).toMatchObject({
      status: "failure",
      summary: "Redirect loop",
    });
  });
  it("treats timeouts and temporary DNS errors as inconclusive", () => {
    expect(classifyError(err("UND_ERR_HEADERS_TIMEOUT"), 10000)).toMatchObject({
      status: "inconclusive",
      summary: "Timed out after 10 s — excluded from failure count",
    });
    expect(classifyError(Object.assign(new Error("x"), { name: "TimeoutError" }), 5000).status).toBe("inconclusive");
    expect(classifyError(new DOMException("The operation timed out.", "TimeoutError"), 5000).category).toBe("timeout");
    expect(classifyError(err("EAI_AGAIN"), 10000).status).toBe("inconclusive");
    expect(classifyError(new Error("wrapped", { cause: err("ECONNRESET") }), 10000).category).toBe("connection_reset");
  });
});

describe("decideUptime", () => {
  const start: UptimeCounters = {
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    consecutiveSlow: 0,
    liveStatus: "unknown",
    statusDetail: null,
  };
  const ok: UptimeResult = {
    status: "success",
    category: null,
    summary: "HTTP 200 OK · 250 ms",
    httpStatus: 200,
    durationMs: 250,
    slow: false,
  };
  const fail: UptimeResult = {
    status: "failure",
    category: "http_5xx",
    summary: "HTTP 502 Bad Gateway · 90 ms",
    httpStatus: 502,
    durationMs: 90,
    slow: false,
  };
  const timeout: UptimeResult = {
    status: "inconclusive",
    category: "timeout",
    summary: "Timed out",
    httpStatus: null,
    durationMs: null,
    slow: false,
  };

  it("needs two consecutive failures to open an incident, confirming quickly", () => {
    const d1 = decideUptime(start, fail, false);
    expect(d1).toMatchObject({
      openIncident: false,
      nextDelayMs: 30000,
      next: { liveStatus: "degraded", consecutiveFailures: 1 },
    });
    const d2 = decideUptime(d1.next, fail, false);
    expect(d2).toMatchObject({ openIncident: true, next: { liveStatus: "down", consecutiveFailures: 2 } });
  });

  it("ignores inconclusive checks between failures", () => {
    const d1 = decideUptime(start, fail, false);
    const d2 = decideUptime(d1.next, timeout, false);
    expect(d2.next).toEqual(d1.next);
    expect(decideUptime(d2.next, fail, false).openIncident).toBe(true);
  });

  it("a single success resets an unconfirmed failure", () => {
    const d1 = decideUptime(start, fail, false);
    expect(decideUptime(d1.next, ok, false)).toMatchObject({ next: { liveStatus: "up", consecutiveFailures: 0 } });
  });

  it("resolves only after two consecutive passes while an incident is open", () => {
    const down: UptimeCounters = {
      consecutiveFailures: 3,
      consecutiveSuccesses: 0,
      consecutiveSlow: 0,
      liveStatus: "down",
      statusDetail: "HTTP 502",
    };
    const r1 = decideUptime(down, ok, true);
    expect(r1).toMatchObject({
      resolveIncident: false,
      next: { liveStatus: "down", statusDetail: "Recovering — 1 of 2 recovery checks passed" },
    });
    const flap = decideUptime(r1.next, fail, true);
    expect(flap).toMatchObject({ openIncident: false, next: { consecutiveSuccesses: 0, liveStatus: "down" } });
    const r2 = decideUptime(decideUptime(flap.next, ok, true).next, ok, true);
    expect(r2).toMatchObject({ resolveIncident: true, next: { liveStatus: "up" } });
  });

  it("reports a site as degraded after two slow responses in a row", () => {
    const slow = { ...ok, slow: true };
    const once = decideUptime(start, slow, false);
    expect(once.next).toMatchObject({ liveStatus: "up", consecutiveSlow: 1 });
    expect(decideUptime(once.next, slow, false).next).toMatchObject({
      liveStatus: "degraded",
      statusDetail: "Slow · HTTP 200 OK · 250 ms",
    });
    expect(decideUptime(decideUptime(once.next, slow, false).next, ok, false).next).toMatchObject({
      liveStatus: "up",
      consecutiveSlow: 0,
    });
  });
});

describe("evaluateCertificate", () => {
  const now = new Date("2026-10-25T09:48:00Z");
  const facts = {
    authorized: true,
    authorizationError: null,
    identityError: null,
    validFrom: new Date("2026-08-01T00:00:00Z"),
    validTo: new Date("2027-05-24T00:00:00Z"),
    issuer: "Let's Encrypt",
  };
  it("classifies valid, expiring, expired, mismatched and untrusted certificates", () => {
    expect(evaluateCertificate(facts, now)).toMatchObject({ status: "success", state: "valid", daysLeft: 210 });
    expect(evaluateCertificate({ ...facts, validTo: new Date("2026-10-31T14:00:00Z") }, now)).toMatchObject({
      state: "expiring",
      daysLeft: 6,
      summary: "Valid (Let's Encrypt) · expires in 6 days",
    });
    expect(
      evaluateCertificate(
        {
          ...facts,
          validTo: new Date("2026-10-20T00:00:00Z"),
          authorized: false,
          authorizationError: "CERT_HAS_EXPIRED",
        },
        now,
      ),
    ).toMatchObject({ status: "failure", state: "expired" });
    // Dates in summaries use the workspace timezone.
    expect(
      evaluateCertificate({ ...facts, validTo: new Date("2015-04-12T23:59:59Z") }, now, "Europe/London").summary,
    ).toBe("Certificate expired on 13 Apr 2015");
    expect(evaluateCertificate({ ...facts, identityError: "Hostname/IP does not match" }, now)).toMatchObject({
      state: "invalid",
      summary: "Certificate doesn’t match the hostname",
    });
    expect(
      evaluateCertificate({ ...facts, authorized: false, authorizationError: "DEPTH_ZERO_SELF_SIGNED_CERT" }, now),
    ).toMatchObject({ state: "invalid", summary: "Certificate isn’t trusted (self-signed)" });
  });
});

describe("expiry thresholds", () => {
  it("maps days to severity", () => {
    expect([31, 30, 14, 8, 7, 2, 1, 0].map(expirySeverity)).toEqual([
      "low",
      "low",
      "medium",
      "medium",
      "high",
      "high",
      "critical",
      "critical",
    ]);
  });
});

describe("RDAP", () => {
  const bootstrap = parseBootstrap({
    services: [
      [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
      [["uk"], ["https://rdap.nominet.uk/uk/"]],
    ],
  });
  it("finds the server for a domain's TLD", () => {
    expect(rdapServerFor("harbourdental.co.uk", bootstrap)).toBe("https://rdap.nominet.uk/uk/");
    expect(rdapServerFor("example.com", bootstrap)).toBe("https://rdap.verisign.com/com/v1/");
    expect(rdapServerFor("example.de", bootstrap)).toBeNull();
  });
  it("reads the expiration event and never invents one", () => {
    const now = new Date("2026-10-25T02:00:00Z");
    const json = {
      events: [
        { eventAction: "registration", eventDate: "2010-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2026-11-06T00:00:00Z" },
      ],
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]] }],
    };
    expect(parseRdapDomain(json, "rdap.verisign.com", now)).toMatchObject({
      state: "expiring",
      daysLeft: 11,
      source: "rdap.verisign.com RDAP (registrar: Example Registrar)",
    });
    expect(parseRdapDomain({ events: [] }, "rdap.denic.de", now)).toMatchObject({
      state: "unsupported",
      expiresAt: null,
      summary: "n/a — expiry not published by the registry",
    });
  });
});

describe("uptime", () => {
  it("excludes inconclusive checks and reports coverage", () => {
    expect(computeUptime({ success: 998, failure: 2, inconclusive: 5 }, 1010)).toMatchObject({
      percent: 99.8,
      conclusive: 1000,
      completed: 1005,
    });
    expect(computeUptime({ success: 0, failure: 0, inconclusive: 3 }, 10).percent).toBeNull();
  });
  it("never rounds a non-perfect result up to 100%", () => {
    expect(formatPercent(99.999)).toBe("99.99%");
    expect(formatPercent(100)).toBe("100.00%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("scheduling helpers", () => {
  it("finds the next sweep slot with stable jitter", () => {
    const now = new Date("2026-10-25T09:48:00Z");
    expect(nextSweep(now, 6, 0, 0).toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(nextSweep(now, 24, 2, 0).toISOString()).toBe("2026-10-26T02:00:00.000Z");
    expect(jitterFor("abc", 1000)).toBe(jitterFor("abc", 1000));
  });
});

describe("nextRegularCheck", () => {
  const MIN = 60_000;
  const id = "01a17bae-c06d-77bb-abdf-0cf832f7be12";
  const phase = jitterFor(id, MIN);

  it("keeps each site on its own fixed slot, whatever time the check finished", () => {
    const slot = Date.UTC(2026, 9, 27, 10, 0, 0) + phase;
    for (const late of [0, 3_000, 9_000, 25_000]) {
      expect(nextRegularCheck(id, MIN, new Date(slot + late)).getTime()).toBe(slot + MIN);
    }
  });

  it("skips to the following slot after running very late, never checking twice in quick succession", () => {
    const slot = Date.UTC(2026, 9, 27, 10, 0, 0) + phase;
    expect(nextRegularCheck(id, MIN, new Date(slot + 50_000)).getTime()).toBe(slot + 2 * MIN);
  });

  it("spreads sites across the interval instead of bunching them", () => {
    const now = new Date(Date.UTC(2026, 9, 27, 10, 0, 0));
    const perSecond = new Map<number, number>();
    for (let i = 0; i < 300; i++) {
      const s = Math.floor(nextRegularCheck(randomUUID(), MIN, now).getTime() / 1000);
      perSecond.set(s, (perSecond.get(s) ?? 0) + 1);
    }
    // 300 sites over 60 seconds is 5 a second on average; nothing like all at once.
    expect(perSecond.size).toBeGreaterThan(50);
    expect(Math.max(...perSecond.values())).toBeLessThan(20);
  });
});
