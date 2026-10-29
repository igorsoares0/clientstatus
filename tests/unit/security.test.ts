import { describe, expect, it } from "vitest";
import { allowAccountEmail, allowSignIn, allowSignUp } from "@/lib/auth-limits";
import { isOpsAdmin } from "@/lib/ops/access";
import { allow, betterAuthRateLimitStorage, clientIp, memoryStore } from "@/lib/rate-limit";
import { isWellFormedToken, newReportToken, openReportToken, sealReportToken } from "@/lib/reports/token";
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
  it("fixed window allows the limit, then blocks until the window resets", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) expect(await allow("k", 3, 1000, 0, store)).toBe(true);
    expect(await allow("k", 3, 1000, 10, store)).toBe(false);
    expect(await allow("k", 3, 1000, 1001, store)).toBe(true);
  });

  it("limits sign-in guesses per address even when the IP changes", async () => {
    const store = memoryStore();
    let allowed = 0;
    for (let i = 0; i < 40; i++) if (await allowSignIn(`10.0.0.${i}`, "victim@example.com", 0, store)) allowed++;
    expect(allowed).toBe(30);
  });

  it("limits sign-in per address and IP", async () => {
    const store = memoryStore();
    let allowed = 0;
    for (let i = 0; i < 15; i++) if (await allowSignIn("203.0.113.5", "user@example.com", 0, store)) allowed++;
    expect(allowed).toBe(10);
  });

  it("limits sign-ups per IP and account emails per address", async () => {
    const store = memoryStore();
    let signups = 0;
    for (let i = 0; i < 25; i++) if (await allowSignUp("198.51.100.7", 0, store)) signups++;
    expect(signups).toBe(20);
    let resets = 0;
    for (let i = 0; i < 8; i++) if (await allowAccountEmail("reset", "inbox@example.com", 0, store)) resets++;
    expect(resets).toBe(5);
  });

  it("gives Better Auth a retry time once its rule is used up", async () => {
    const storage = betterAuthRateLimitStorage(memoryStore());
    const rule = { window: 60, max: 2 };
    expect(await storage.consume("1.2.3.4/sign-in/email", rule)).toEqual({ allowed: true, retryAfter: null });
    await storage.consume("1.2.3.4/sign-in/email", rule);
    const blocked = await storage.consume("1.2.3.4/sign-in/email", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});

describe("client address", () => {
  const xff = (value: string) => new Headers({ "x-forwarded-for": value });

  it("reads X-Forwarded-For from the right, so a spoofed left end is ignored", () => {
    expect(clientIp(xff("6.6.6.6, 203.0.113.9"), { hops: 1 })).toBe("203.0.113.9");
    expect(clientIp(xff("6.6.6.6, 203.0.113.9, 10.0.0.2"), { hops: 2 })).toBe("203.0.113.9");
    expect(clientIp(xff("203.0.113.9"), { hops: 1 })).toBe("203.0.113.9");
    expect(clientIp(xff("2001:db8::1"), { hops: 1 })).toBe("2001:db8::1");
  });

  it("is unknown when the chain is shorter than the proxies or isn't an address", () => {
    expect(clientIp(xff("203.0.113.9"), { hops: 2 })).toBe("unknown");
    expect(clientIp(xff("not-an-ip"), { hops: 1 })).toBe("unknown");
    expect(clientIp(new Headers(), { hops: 1 })).toBe("unknown");
  });

  it("prefers the header the edge sets, when one is configured", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "198.51.100.4" });
    expect(clientIp(h, { hops: 1, header: "cf-connecting-ip" })).toBe("198.51.100.4");
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

  it("are sealed for queued emails: readable only with the secret, for the same report, untampered", () => {
    const secret = "s".repeat(32);
    const { token } = newReportToken();
    const sealed = sealReportToken(token, "report-1", secret);
    expect(sealed).not.toContain(token);
    expect(sealReportToken(token, "report-1", secret)).not.toBe(sealed); // fresh IV every time
    expect(openReportToken(sealed, "report-1", secret)).toBe(token);
    expect(() => openReportToken(sealed, "report-2", secret)).toThrow();
    expect(() => openReportToken(sealed, "report-1", "t".repeat(32))).toThrow();
    const [v, iv, tag, data] = sealed.split(".");
    const flipped = `${data![0] === "A" ? "B" : "A"}${data!.slice(1)}`;
    expect(() => openReportToken([v, iv, tag, flipped].join("."), "report-1", secret)).toThrow();
    expect(() => openReportToken("v0.x.y.z", "report-1", secret)).toThrow();
  });
});

describe("ops access", () => {
  it("ops access is an explicit allowlist and empty means nobody", () => {
    expect(isOpsAdmin("ops@clientstatus.app", "ops@clientstatus.app")).toBe(true);
    expect(isOpsAdmin("OPS@clientstatus.app ", "ops@clientstatus.app")).toBe(true);
    expect(isOpsAdmin("ops@clientstatus.app", undefined)).toBe(false);
    expect(isOpsAdmin("other@clientstatus.app", "ops@clientstatus.app")).toBe(false);
  });
});
