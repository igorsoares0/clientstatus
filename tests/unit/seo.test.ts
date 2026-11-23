import { existsSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd } from "@/components/marketing/breadcrumbs";
import { jsonLdString } from "@/components/marketing/json-ld";
import { formatDay, formatMonth } from "@/components/marketing/updated-at";
import { proxy } from "@/proxy";
import {
  absoluteUrl,
  activeSitemapSections,
  fullTitle,
  MARKETING_PREFIXES,
  metadataIssues,
  pageMetadata,
  ROBOTS_DISALLOW,
  robotsConfig,
  SITE_URL,
  SITEMAP_SECTIONS,
  sitemapEntries,
  sitemapPages,
  sitemapPath,
} from "@/lib/seo";

// docs/pseo-plan.md, Phase 1.

const okDescription =
  "Monitor every client website for uptime, SSL, domains and broken links, and send each client a branded monthly report on the 1st.";

describe("proxy: marketing pages are public", () => {
  const anonymous = (path: string) => proxy(new NextRequest(new URL(path, "http://localhost:3000")));

  it.each(MARKETING_PREFIXES.flatMap((p) => [p, `${p}/some-page`]))("%s is reachable without a session", (path) => {
    const res = anonymous(path);
    expect(res.headers.get("location")).toBeNull();
  });

  it("app pages still redirect anonymous visitors to sign-in", () => {
    const res = anonymous("/overview");
    expect(res.headers.get("location")).toContain("/sign-in");
  });

  it("a prefix doesn't open lookalike paths", () => {
    // "/for" must not make "/forbidden" public; "/forgot-password" is public on its own.
    expect(anonymous("/forbidden").headers.get("location")).toContain("/sign-in");
    expect(anonymous("/tools-admin").headers.get("location")).toContain("/sign-in");
  });

  it("signed-in visitors on the landing page still go to the app", () => {
    const req = new NextRequest(new URL("/", "http://localhost:3000"), {
      headers: { cookie: "better-auth.session_token=abc.def" },
    });
    expect(proxy(req).headers.get("location")).toContain("/overview");
  });
});

describe("absoluteUrl", () => {
  it("builds canonical URLs on the public origin", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(absoluteUrl("/alternatives/uptimerobot")).toBe(`${SITE_URL}/alternatives/uptimerobot`);
  });

  it("refuses relative paths", () => {
    expect(() => absoluteUrl("alternatives")).toThrow();
  });

  it("has no trailing slash on the origin", () => {
    expect(SITE_URL).not.toMatch(/\/$/);
  });
});

describe("pageMetadata", () => {
  it("sets an absolute canonical, Open Graph and Twitter", () => {
    const m = pageMetadata({
      title: "UptimeRobot alternative",
      description: okDescription,
      path: "/alternatives/uptimerobot",
    });
    expect(m.title).toBe("UptimeRobot alternative");
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/alternatives/uptimerobot`);
    expect(m.openGraph).toMatchObject({
      title: "UptimeRobot alternative · Client Status",
      url: `${SITE_URL}/alternatives/uptimerobot`,
      description: okDescription,
    });
    expect(m.twitter).toMatchObject({ card: "summary", description: okDescription });
  });

  it("makes a relative image absolute and uses the large card", () => {
    const m = pageMetadata({ title: "T", description: okDescription, path: "/tools", ogImage: "/og/tools.png" });
    expect(m.openGraph?.images).toEqual([{ url: `${SITE_URL}/og/tools.png` }]);
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("metadataIssues", () => {
  it("accepts a title within 60 chars with the suffix and a 120–160 char description", () => {
    expect(metadataIssues({ title: "UptimeRobot alternative for agencies", description: okDescription })).toEqual([]);
  });

  it("counts the suffix toward the title limit", () => {
    const title = "x".repeat(60 - fullTitle("").length + 1);
    expect(metadataIssues({ title, description: okDescription })).toHaveLength(1);
  });

  it("flags short and long descriptions", () => {
    expect(metadataIssues({ title: "Ok", description: "Too short." })).toHaveLength(1);
    expect(metadataIssues({ title: "Ok", description: "x".repeat(161) })).toHaveLength(1);
  });
});

describe("sitemaps", () => {
  it("core lists the public pages with absolute URLs", () => {
    const urls = sitemapEntries("core").map((e) => e.url);
    expect(urls).toEqual(expect.arrayContaining([`${SITE_URL}/`, `${SITE_URL}/terms`, `${SITE_URL}/bot`]));
  });

  it("only sections with pages get a sitemap", () => {
    for (const s of SITEMAP_SECTIONS) {
      expect(activeSitemapSections().includes(s)).toBe(sitemapPages(s).length > 0);
    }
    expect(activeSitemapSections()).toContain("core");
  });

  it("no indexable URL is blocked by robots.txt or private to the app", () => {
    for (const s of SITEMAP_SECTIONS) {
      for (const p of sitemapPages(s)) {
        expect(
          ROBOTS_DISALLOW.some((d) => p.path.startsWith(d)),
          p.path,
        ).toBe(false);
      }
    }
  });

  it("paths are unique across sections", () => {
    const paths = SITEMAP_SECTIONS.flatMap((s) => sitemapPages(s).map((p) => p.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("lastModified values are valid dates", () => {
    for (const s of SITEMAP_SECTIONS) {
      for (const p of sitemapPages(s)) {
        if (p.lastModified) expect(Number.isNaN(Date.parse(p.lastModified)), p.path).toBe(false);
      }
    }
  });

  it("every section with pages has its sitemap.ts, listed in robots.txt", () => {
    const listed = robotsConfig().sitemap;
    for (const s of activeSitemapSections()) {
      const file = s === "core" ? "app/sitemap.ts" : `app/(marketing)/${s}/sitemap.ts`;
      expect(existsSync(path.join(import.meta.dirname, "../..", file)), file).toBe(true);
      expect(listed).toContain(`${SITE_URL}${sitemapPath(s)}`);
    }
  });
});

describe("robots", () => {
  const rules = robotsConfig().rules;
  const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow as string[];

  it("blocks report links, the API and the app", () => {
    expect(disallow).toEqual(expect.arrayContaining(["/r/", "/api/", "/ops", "/overview", "/billing"]));
  });

  it("never blocks a marketing prefix", () => {
    for (const p of MARKETING_PREFIXES) {
      expect(
        disallow.some((d) => p.startsWith(d) || `${p}/x`.startsWith(d)),
        p,
      ).toBe(false);
    }
  });

  it("lists the sitemap index", () => {
    expect(robotsConfig().sitemap).toContain(`${SITE_URL}/sitemap.xml`);
  });
});

describe("marketing helpers", () => {
  it("escapes < in JSON-LD so data can't close the script tag", () => {
    const out = jsonLdString({ "@type": "Thing", name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
    expect(JSON.parse(out)["@context"]).toBe("https://schema.org");
  });

  it("breadcrumbs start at Home with absolute URLs", () => {
    const ld = breadcrumbJsonLd([
      { name: "Alternatives", path: "/alternatives" },
      { name: "UptimeRobot", path: "/alternatives/uptimerobot" },
    ]);
    expect(ld.itemListElement.map((i) => [i.position, i.item])).toEqual([
      [1, `${SITE_URL}/`],
      [2, `${SITE_URL}/alternatives`],
      [3, `${SITE_URL}/alternatives/uptimerobot`],
    ]);
  });

  it("formats data-file dates in UTC", () => {
    expect(formatDay("2026-11-01")).toBe("November 1, 2026");
    expect(formatMonth("2026-11-01")).toBe("November 2026");
    expect(() => formatDay("not a date")).toThrow();
  });
});
