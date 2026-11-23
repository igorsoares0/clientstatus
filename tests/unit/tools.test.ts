import { describe, expect, it } from "vitest";
import { getTld, isIndexable, neighbours, TLDS, tldSeo, DOMAIN_EXPIRY_HUB } from "@/content/tlds";
import { TOOL_SEO, TOOLS_HUB } from "@/content/tool-seo";
import { TOOLS } from "@/content/tools";
import type { CrawlResult } from "@/lib/crawler/crawl";
import { memoryStore } from "@/lib/rate-limit";
import { renderReportHtml } from "@/lib/reports/render";
import { metadataIssues, sitemapPages } from "@/lib/seo";
import { nextWarning, parseTarget } from "@/lib/tools/checks";
import { shortUrl, summariseCrawl } from "@/lib/tools/crawl";
import { sameOrigin } from "@/lib/tools/http";
import { allowReportEmail, allowToolRequest, TOOL_SLUGS } from "@/lib/tools/limits";
import { buildSampleReport, SAMPLE_BRANDING, type Snapshot } from "@/lib/tools/sample-report";

// docs/pseo-plan.md, Phase 3: free tools and /domain-expiry/[tld].

describe("tool input", () => {
  it.each(["example.com", "https://www.example.com/page", "http://shop.example.co.uk"])("accepts %s", (raw) => {
    expect(parseTarget(raw).ok).toBe(true);
  });

  it.each([
    "localhost",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]",
    "http://10.0.0.1",
    "http://metadata.google.internal",
    "file:///etc/passwd",
    "intranet",
    "",
  ])("refuses %s", (raw) => {
    expect(parseTarget(raw).ok).toBe(false);
  });

  it("refuses non-strings", () => {
    expect(parseTarget(undefined).ok).toBe(false);
    expect(parseTarget({ url: "example.com" }).ok).toBe(false);
  });

  it("keeps www for the TLS hostname and reduces to the registrable domain for RDAP", () => {
    const t = parseTarget("https://www.shop.example.co.uk/x");
    expect(t).toEqual({ ok: true, hostname: "www.shop.example.co.uk", registrableDomain: "example.co.uk" });
  });
});

describe("SSL warning schedule", () => {
  it.each([
    [90, 30],
    [30, 30],
    [20, 14],
    [10, 7],
    [3, 1],
    [0, null],
    [-2, null],
    [null, null],
  ])("%s days left → next warning %s", (days, next) => {
    expect(nextWarning(days)).toBe(next);
  });
});

describe("rate limits", () => {
  it("allows 10 checks per IP per 10 minutes, per tool", async () => {
    const store = memoryStore();
    const now = Date.now();
    for (let i = 0; i < 10; i++) expect(await allowToolRequest("ssl-checker", "1.2.3.4", now, store)).toBe(true);
    expect(await allowToolRequest("ssl-checker", "1.2.3.4", now, store)).toBe(false);
    expect(await allowToolRequest("ssl-checker", "5.6.7.8", now, store)).toBe(true);
    expect(await allowToolRequest("domain-expiry-checker", "1.2.3.4", now, store)).toBe(true);
    expect(await allowToolRequest("ssl-checker", "1.2.3.4", now + 10 * 60_000, store)).toBe(true);
  });

  it("sends at most two reports a day to one address, whatever the IP", async () => {
    const store = memoryStore();
    const now = Date.now();
    expect(await allowReportEmail("A@Example.com", "1.1.1.1", now, store)).toBe(true);
    expect(await allowReportEmail("a@example.com ", "2.2.2.2", now, store)).toBe(true);
    expect(await allowReportEmail("a@example.com", "3.3.3.3", now, store)).toBe(false);
    expect(await allowReportEmail("b@example.com", "4.4.4.4", now, store)).toBe(true);
  });

  it("limits report emails per IP", async () => {
    const store = memoryStore();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(await allowReportEmail(`p${i}@example.com`, "9.9.9.9", now, store)).toBe(true);
    expect(await allowReportEmail("p9@example.com", "9.9.9.9", now, store)).toBe(false);
  });
});

describe("same-origin check", () => {
  const post = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/tools/ssl-checker", { method: "POST", headers });

  it("accepts our own origin and refuses others or none", () => {
    expect(sameOrigin(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(sameOrigin(post({ origin: "https://evil.example", host: "localhost:3000" }))).toBe(false);
    expect(sameOrigin(post({ host: "localhost:3000" }))).toBe(false);
  });
});

const crawl = (over: Partial<CrawlResult> = {}): CrawlResult => ({
  status: "completed",
  partialReasons: [],
  pagesVisited: 12,
  linksChecked: 140,
  requests: 160,
  inconclusiveLinks: 2,
  skippedByRobots: 1,
  brokenInternal: 1,
  brokenExternal: 1,
  robots: "ok",
  findings: [
    {
      type: "broken_link",
      severity: "high",
      sourceUrl: "https://site.example.com/about",
      targetUrl: "https://site.example.com/team",
      statusCode: 404,
      summary: "Broken internal link — HTTP 404 Not Found",
    },
    {
      type: "broken_link",
      severity: "medium",
      sourceUrl: "https://site.example.com/",
      targetUrl: "https://other.example.org/gone",
      statusCode: 410,
      summary: "Broken external link — HTTP 410 Gone",
    },
    {
      type: "missing_title",
      severity: "medium",
      sourceUrl: "https://site.example.com/contact",
      targetUrl: null,
      statusCode: null,
      summary: "Page has no title",
    },
  ],
  ...over,
});

describe("broken-link result", () => {
  it("lists broken links with short same-site paths and groups the rest", () => {
    const r = summariseCrawl("https://site.example.com", crawl());
    expect(r.brokenTotal).toBe(2);
    expect(r.broken[0]).toMatchObject({ target: "/team", source: "/about", statusCode: 404 });
    expect(r.broken[1].target).toBe("https://other.example.org/gone");
    expect(r.otherFindings).toEqual([
      { label: "Pages without a title", priority: "improve", count: 1, examples: ["/contact"] },
    ]);
  });

  it("shortens only same-origin URLs", () => {
    expect(shortUrl("https://a.example.com/x?y=1", "https://a.example.com")).toBe("/x?y=1");
    expect(shortUrl("https://b.example.com/x", "https://a.example.com")).toBe("https://b.example.com/x");
    expect(shortUrl(null, "https://a.example.com")).toBe("");
  });
});

describe("sample health report", () => {
  const base: Snapshot = {
    url: "https://site.example.com",
    checkedAt: new Date("2026-11-22T10:00:00Z"),
    uptime: {
      status: "success",
      category: null,
      summary: "HTTP 200 OK",
      httpStatus: 200,
      durationMs: 420,
      slow: false,
    },
    ssl: {
      status: "success",
      state: "expiring",
      expiresAt: new Date("2026-12-10T00:00:00Z"),
      issuer: "Let's Encrypt",
      daysLeft: 17,
      category: "expiring",
      summary: "Valid (Let's Encrypt) · expires in 17 days",
    },
    domain: {
      status: "success",
      state: "unsupported",
      expiresAt: null,
      source: null,
      daysLeft: null,
      summary: "n/a — this registry doesn’t offer RDAP",
    },
    crawl: crawl(),
  };

  it("is labelled as a sample everywhere it matters", () => {
    const d = buildSampleReport(base);
    expect(d.kind).toBe("sample");
    expect(d.disclosures[0]).toMatch(/sample built from a single check/);
    expect(d.summary[0]).toMatch(/sample/i);
    const html = renderReportHtml(d, SAMPLE_BRANDING, { forPdf: true });
    expect(html).toContain("WEBSITE HEALTH REPORT · SAMPLE");
    expect(html).not.toMatch(/in Sample\b/);
    expect(html).toContain("Prepared with Client Status");
  });

  it("never turns one failed check into downtime", () => {
    const d = buildSampleReport({
      ...base,
      uptime: {
        status: "failure",
        category: "http_5xx",
        summary: "HTTP 503",
        httpStatus: 503,
        durationMs: 80,
        slow: false,
      },
    });
    expect(d.sites[0].downtimeMinutes).toBe(0);
    expect(d.incidents).toEqual([]);
    expect(d.sites[0].days).toEqual(["partial"]);
    expect(d.disclosures.join(" ")).toMatch(/two failed checks in a row/);
  });

  it("maps audit findings and dates like the monthly report", () => {
    const d = buildSampleReport(base);
    expect(d.findings[0]).toMatchObject({ priority: "fix", label: "Broken links", count: 2 });
    expect(d.findings[0].examples[0]).toBe("/about → /team (404)");
    expect(d.dates.map((x) => x.text)).toEqual(["SSL certificate for site.example.com expires"]);
    expect(d.sites[0].ssl.status).toBe("expiring");
    expect(d.sites[0].domain.status).toBe("unsupported");
  });

  it("explains when the mini audit couldn't run", () => {
    const d = buildSampleReport({ ...base, crawl: null });
    expect(d.sites[0].audit).toBeNull();
    expect(d.disclosures.join(" ")).toMatch(/mini audit couldn’t run/);
  });
});

describe("tool pages", () => {
  it("has a page and copy for every tool", () => {
    expect(TOOLS.map((t) => t.slug).sort()).toEqual([...TOOL_SLUGS].sort());
    for (const t of TOOLS) {
      expect(t.sections.length, t.slug).toBeGreaterThanOrEqual(3);
      expect(t.faq.length, t.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it.each([TOOLS_HUB, ...Object.values(TOOL_SEO)].map((p) => [p.path, p] as const))(
    "%s meets the title and description rules",
    (_, p) => {
      expect(metadataIssues(p)).toEqual([]);
    },
  );

  it("lists the hub and every tool in the tools sitemap", () => {
    expect(sitemapPages("tools").map((p) => p.path)).toEqual([
      TOOLS_HUB.path,
      ...Object.values(TOOL_SEO).map((p) => p.path),
    ]);
  });
});

describe("domain expiry by TLD", () => {
  it("indexes only TLDs with a listed RDAP server and an answered lookup", () => {
    for (const t of TLDS) {
      expect(isIndexable(t), t.tld).toBe(
        t.rdapServer !== null && ["published", "not-published"].includes(t.test.result),
      );
    }
    const indexed = sitemapPages("domain-expiry").map((p) => p.path);
    expect(indexed[0]).toBe(DOMAIN_EXPIRY_HUB.path);
    expect(indexed).toHaveLength(TLDS.filter(isIndexable).length + 1);
    expect(indexed).not.toContain("/domain-expiry/de");
  });

  it("has data for the wave-1 TLDs", () => {
    expect(TLDS.length).toBeGreaterThanOrEqual(25);
    for (const t of TLDS) {
      expect(t.category, t.tld).toBeTruthy();
      expect(t.manager, t.tld).toBeTruthy();
    }
    expect(getTld("com")?.test.result).toBe("published");
  });

  it.each([DOMAIN_EXPIRY_HUB, ...TLDS.map(tldSeo)].map((p) => [p.path, p] as const))(
    "%s meets the title and description rules",
    (_, p) => {
      expect(metadataIssues(p)).toEqual([]);
    },
  );

  it("links neighbours of the same kind", () => {
    for (const t of TLDS) {
      for (const n of neighbours(t)) {
        expect(n.kind).toBe(t.kind);
        expect(n.tld).not.toBe(t.tld);
      }
    }
  });
});

describe("sample report audit line", () => {
  it("says when the mini audit stopped early instead of claiming a clean bill", async () => {
    const { buildSampleReport: build } = await import("@/lib/tools/sample-report");
    const d = build({
      url: "https://site.example.com",
      checkedAt: new Date("2026-11-22T10:00:00Z"),
      uptime: {
        status: "success",
        category: null,
        summary: "HTTP 200 OK",
        httpStatus: 200,
        durationMs: 300,
        slow: false,
      },
      ssl: null,
      domain: null,
      crawl: crawl({
        status: "partial",
        partialReasons: ["robots.txt unavailable — only the start page was crawled"],
        pagesVisited: 1,
        findings: [],
      }),
    });
    expect(d.summary.join(" ")).toMatch(/stopped early after 1 page/);
    expect(d.summary.join(" ")).not.toMatch(/up to 50 pages found nothing/);
  });
});
