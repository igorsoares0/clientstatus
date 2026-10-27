import { describe, expect, it } from "vitest";
import { classifyLinkError, classifyLinkResponse } from "@/lib/crawler/classify";
import { findingKey, pageFindings, sitemapFinding } from "@/lib/crawler/findings";
import { extractPage } from "@/lib/crawler/html";
import { looksLikeAsset, normalizeCrawlUrl, sameSite } from "@/lib/crawler/normalize";
import { parseRobots } from "@/lib/crawler/robots";
import { RedirectError } from "@/lib/monitoring/safe-fetch";

describe("normalizeCrawlUrl", () => {
  it("resolves, strips fragments and default ports, and skips non-web schemes", () => {
    expect(normalizeCrawlUrl("../about#team", "https://Example.com:443/blog/post")).toBe("https://example.com/about");
    expect(normalizeCrawlUrl("http://example.com:80/x?a=1", "https://example.com")).toBe("http://example.com/x?a=1");
    for (const href of ["mailto:a@b.co", "tel:123", "javascript:void(0)", "#top", "", "data:text/plain,x"]) {
      expect(normalizeCrawlUrl(href, "https://example.com")).toBeNull();
    }
  });
  it("treats www as the same site and recognises assets", () => {
    expect(sameSite("https://www.example.com/a", "https://example.com")).toBe(true);
    expect(sameSite("https://shop.example.com", "https://example.com")).toBe(false);
    expect(looksLikeAsset("https://example.com/files/menu.PDF")).toBe(true);
    expect(looksLikeAsset("https://example.com/menu")).toBe(false);
  });
});

describe("extractPage", () => {
  const html = `<!doctype html><html><head><title> Harbour  Dental &amp; Co </title>
    <meta name="description" content="Family dentist">
    <link rel="canonical" href="/home">
    <base href="https://example.com/sub/">
  </head><body><h1>One</h1><h1>Two</h1>
    <a href="page">Rel</a><a href="https://other.org/x" rel="nofollow noopener">Out</a>
    <a href="page#again">Dup</a><a href="mailto:x@y.z">Mail</a>
    <script>var a = "<a href='/fake'>";</script>
  </body></html>`;
  it("reads title, description, canonical, headings and links", () => {
    const f = extractPage(html, "https://example.com/");
    expect(f).toMatchObject({
      title: "Harbour Dental & Co",
      metaDescription: "Family dentist",
      canonical: "https://example.com/home",
      h1Count: 2,
      noindex: false,
    });
    expect(f.links).toEqual([
      { url: "https://example.com/sub/page", nofollow: false },
      { url: "https://other.org/x", nofollow: true },
    ]);
  });
  it("spots an empty single-page-app shell", () => {
    expect(
      extractPage(`<body><div id="root"></div><script src="/app.js"></script></body>`, "https://e.com/").spaRoot,
    ).toBe(true);
    expect(extractPage(`<body><p>Plain page</p><script src="/s.js"></script></body>`, "https://e.com/").spaRoot).toBe(
      false,
    );
  });

  it("detects noindex and malformed canonicals", () => {
    const f = extractPage(
      `<meta name="robots" content="noindex,follow"><link rel="canonical" href="http://[bad">`,
      "https://example.com/",
    );
    expect(f.noindex).toBe(true);
    expect(f.canonicalRaw).toBe("http://[bad");
    expect(f.canonical).toBeNull();
  });
});

describe("pageFindings", () => {
  const base = {
    title: "T",
    metaDescription: "D",
    canonicalRaw: "/",
    canonical: "https://example.com/",
    h1Count: 1,
    noindex: false,
    links: [],
    scriptCount: 0,
    textLength: 500,
    spaRoot: false,
  };
  it("flags missing basics with the right severities", () => {
    const f = pageFindings("https://example.com/a", {
      ...base,
      title: null,
      metaDescription: "",
      canonicalRaw: null,
      canonical: null,
      h1Count: 0,
    });
    expect(f.map((x) => [x.type, x.severity])).toEqual([
      ["missing_title", "medium"],
      ["missing_meta_description", "low"],
      ["missing_canonical", "low"],
      ["missing_h1", "low"],
    ]);
  });
  it("treats multiple h1s as advisory and skips noindex pages", () => {
    expect(pageFindings("https://example.com/a", { ...base, h1Count: 3 }).map((x) => [x.type, x.severity])).toEqual([
      ["multiple_h1", "info"],
    ]);
    expect(pageFindings("https://example.com/a", { ...base, title: null, noindex: true })).toEqual([]);
    expect(pageFindings("https://example.com/a", { ...base, canonical: "https://other.org/" })[0].summary).toBe(
      "Canonical URL points to another domain",
    );
  });
  it("gives findings a stable identity", () => {
    const a = { type: "missing_h1" as const, sourceUrl: "https://example.com/a", targetUrl: null };
    expect(findingKey(a)).toBe(findingKey({ ...a }));
    expect(findingKey(a)).not.toBe(findingKey({ ...a, sourceUrl: "https://example.com/b" }));
  });
  it("only reports a missing sitemap when one was promised", () => {
    expect(sitemapFinding("https://example.com/sitemap.xml", 404, false)).toBeNull();
    expect(sitemapFinding("https://example.com/sitemap.xml", 404, true)?.summary).toBe(
      "Sitemap returned HTTP 404 (listed in robots.txt)",
    );
    expect(sitemapFinding("https://example.com/sitemap.xml", 500, false)?.severity).toBe("low");
  });
});

describe("robots", () => {
  it("honours rules for our bot and the wildcard group", () => {
    const r = parseRobots(
      "https://example.com/robots.txt",
      "User-agent: *\nDisallow: /private\nCrawl-delay: 2\nSitemap: https://example.com/sm.xml\n\nUser-agent: ClientStatusBot\nDisallow: /no-bots\n",
      200,
    );
    expect(r.isAllowed("https://example.com/no-bots/x")).toBe(false);
    expect(r.isAllowed("https://example.com/private")).toBe(true); // our group overrides "*"
    expect(r.sitemaps).toEqual(["https://example.com/sm.xml"]);
  });
  it("allows everything when missing and only the start page when erroring", () => {
    expect(parseRobots("https://e.com/robots.txt", "", 404).isAllowed("https://e.com/x")).toBe(true);
    const err = parseRobots("https://e.com/robots.txt", "", 503);
    expect(err.state).toBe("error");
    expect(err.isAllowed("https://e.com/")).toBe(true);
    expect(err.isAllowed("https://e.com/x")).toBe(false);
  });
});

describe("link classification", () => {
  it("separates broken, redirect issues and inconclusive outcomes", () => {
    expect(classifyLinkResponse({ status: 404, redirects: 0, botChallenge: false }, false)).toMatchObject({
      kind: "broken",
      reason: "HTTP 404 Not Found",
    });
    expect(classifyLinkResponse({ status: 503, redirects: 0, botChallenge: false }, true).kind).toBe("broken");
    expect(classifyLinkResponse({ status: 503, redirects: 0, botChallenge: false }, false).kind).toBe("inconclusive");
    expect(classifyLinkResponse({ status: 403, redirects: 0, botChallenge: false }, false).kind).toBe("inconclusive");
    expect(classifyLinkResponse({ status: 429, redirects: 0, botChallenge: false }, true).kind).toBe("inconclusive");
    expect(classifyLinkResponse({ status: 200, redirects: 4, botChallenge: false }, true)).toMatchObject({
      kind: "redirect_issue",
    });
    expect(classifyLinkResponse({ status: 200, redirects: 2, botChallenge: false }, true).kind).toBe("valid");
    expect(classifyLinkError(new RedirectError("loop", "loop"))).toMatchObject({
      kind: "redirect_issue",
      reason: "Redirect loop",
    });
    expect(classifyLinkError(Object.assign(new Error("x"), { code: "ENOTFOUND" })).kind).toBe("broken");
    expect(classifyLinkError(new DOMException("t", "TimeoutError"))).toMatchObject({
      kind: "inconclusive",
      reason: "Timed out",
    });
  });
});
