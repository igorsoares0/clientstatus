import { describe, expect, it } from "vitest";
import { allowAccountEmail, allowSignIn, allowSignUp } from "@/lib/auth-limits";
import { isOpsAdmin } from "@/lib/ops/access";
import { allow } from "@/lib/rate-limit";
import { isWellFormedToken, newReportToken } from "@/lib/reports/token";
import { isSignupAllowed } from "@/lib/signup-allowlist";
import { isPrivateIp, normalizeSiteUrl } from "@/lib/url";

// Spec §13 "Security tests": SSRF inputs, rate limits, token brute-force resistance.

describe("SSRF: hostile website addresses are refused at input", () => {
  const hostile = [
    "http://localhost",
    "http://localhost.:8080",
    "http://127.0.0.1",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://0177.0.0.1",
    "http://0.0.0.0",
    "http://[::]",
    "http://[::1]",
    "http://[0:0:0:0:0:0:0:1]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:7f00:1]",
    "http://[fe80::1]",
    "http://[fd12:3456::1]",
    "http://[64:ff9b::a9fe:a9fe]",
    "http://[2002:7f00:1::]",
    "http://169.254.169.254/latest/meta-data",
    "http://metadata.google.internal",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://172.16.5.5",
    "http://100.100.100.200",
    "http://printer.local",
    "http://intranet",
    "file:///etc/passwd",
    "ftp://example.com",
    "gopher://example.com",
    "javascript:alert(1)",
    "https://user:pass@example.com",
  ];
  it.each(hostile)("refuses %s", (url) => {
    expect(normalizeSiteUrl(url).ok).toBe(false);
  });

  it("still accepts ordinary public sites", () => {
    expect(normalizeSiteUrl("https://example.com/shop?x=1").ok).toBe(true);
  });
});

describe("SSRF: private address classification (used again at connection time)", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "169.254.169.254",
    "192.0.2.10",
    "198.51.100.1",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:c0a8:0101::1",
    "fe80::1%eth0",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
  ])("%s is private", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"])(
    "%s is public",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

describe("rate limits", () => {
  it("fixed window allows the limit, then blocks until the window resets", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(allow(key, 3, 1000, 0)).toBe(true);
    expect(allow(key, 3, 1000, 10)).toBe(false);
    expect(allow(key, 3, 1000, 1001)).toBe(true);
  });

  it("limits sign-in guesses per address even when the IP changes", () => {
    const email = `victim-${Math.random()}@example.com`;
    let allowed = 0;
    for (let i = 0; i < 40; i++) if (allowSignIn(`10.0.0.${i}`, email, 0)) allowed++;
    expect(allowed).toBe(30);
  });

  it("limits sign-in per address and IP", () => {
    const email = `user-${Math.random()}@example.com`;
    let allowed = 0;
    for (let i = 0; i < 15; i++) if (allowSignIn("203.0.113.5", email, 0)) allowed++;
    expect(allowed).toBe(10);
  });

  it("limits sign-ups per IP and account emails per address", () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}-${Math.random()}`;
    let signups = 0;
    for (let i = 0; i < 25; i++) if (allowSignUp(ip, 0)) signups++;
    expect(signups).toBe(20);
    const email = `inbox-${Math.random()}@example.com`;
    let resets = 0;
    for (let i = 0; i < 8; i++) if (allowAccountEmail("reset", email, 0)) resets++;
    expect(resets).toBe(5);
  });
});

describe("report tokens resist brute force", () => {
  it("are 256-bit random values and malformed guesses are rejected before any lookup", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newReportToken().token));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken("../../etc/passwd")).toBe(false);
  });
});

describe("access allowlists", () => {
  it("private beta sign-up allowlist matches emails and @domains, case-insensitively", () => {
    const list = "ana@northfold.studio, @harbour.agency";
    expect(isSignupAllowed("Ana@Northfold.Studio", list)).toBe(true);
    expect(isSignupAllowed("sam@harbour.agency", list)).toBe(true);
    expect(isSignupAllowed("sam@evil-harbour.agency", list)).toBe(false);
    expect(isSignupAllowed("sam@harbour.agency.evil.com", list)).toBe(false);
    expect(isSignupAllowed("bob@northfold.studio", list)).toBe(false);
    expect(isSignupAllowed("anyone@example.com", undefined)).toBe(true);
  });

  it("ops access is an explicit allowlist and empty means nobody", () => {
    expect(isOpsAdmin("ops@clientstatus.app", "ops@clientstatus.app")).toBe(true);
    expect(isOpsAdmin("OPS@clientstatus.app ", "ops@clientstatus.app")).toBe(true);
    expect(isOpsAdmin("ops@clientstatus.app", undefined)).toBe(false);
    expect(isOpsAdmin("other@clientstatus.app", "ops@clientstatus.app")).toBe(false);
  });
});
