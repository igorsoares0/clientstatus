import { describe, expect, it } from "vitest";
import { ERROR_GROUPS, ERRORS, ERRORS_HUB } from "@/content/errors";
import { PLATFORMS } from "@/content/platforms";
import { runProbe } from "@/lib/error-probes";
import { metadataIssues, SITEMAP_SECTIONS, sitemapPages } from "@/lib/seo";
import { relatedLinks } from "@/lib/seo-links";

// docs/pseo-plan.md, Phase 5: the error glossary. The "how Client Status classifies it" claims are
// checked against the product's own classifiers, so changing a rule fails here until the copy changes.

const DAY_MS = 86_400_000;

describe("error glossary", () => {
  it.each([ERRORS_HUB, ...ERRORS.map((e) => e.seo)].map((p) => [p.path, p] as const))(
    "%s meets the title and description rules",
    (_, p) => expect(metadataIssues(p)).toEqual([]),
  );

  it.each(ERRORS.map((e) => [e.slug, e] as const))("%s: the classification matches the product's code", (_, e) => {
    expect(e.probes.length).toBeGreaterThan(0);
    for (const { probe, expect: want } of e.probes) expect(runProbe(probe).status, JSON.stringify(probe)).toBe(want);
  });

  it("slugs, paths and codes are unique, and every group has errors", () => {
    for (const key of ["slug", "code"] as const) expect(new Set(ERRORS.map((e) => e[key])).size).toBe(ERRORS.length);
    for (const e of ERRORS) expect(e.seo.path).toBe(`/errors/${e.slug}`);
    for (const g of ERROR_GROUPS)
      expect(
        ERRORS.some((e) => e.group === g.id),
        g.id,
      ).toBe(true);
  });

  it("each page has its own explanation, causes and fixes", () => {
    for (const field of ["meaning", "visitor", "clientStatus"] as const) {
      // Cloudflare pages share the visitor line and, where the product behaves the same, the classification.
      const own = ERRORS.filter((e) => !(e.group === "cloudflare" && field !== "meaning"));
      expect(new Set(own.map((e) => e[field])).size, field).toBe(own.length);
    }
    const causes = ERRORS.flatMap((e) => e.causes.map((c) => c.title));
    expect(new Set(causes).size).toBe(causes.length);
    for (const e of ERRORS) {
      expect(e.causes.length, e.slug).toBeGreaterThanOrEqual(2);
      expect(e.fixes.length, e.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("cites sources and was checked recently", () => {
    for (const e of ERRORS) {
      expect(e.sources.length, e.slug).toBeGreaterThan(0);
      for (const s of e.sources) expect(new URL(s).protocol).toBe("https:");
      const age = (Date.now() - Date.parse(`${e.verifiedAt}T00:00:00Z`)) / DAY_MS;
      expect(age, `${e.slug} is ${Math.floor(age)} days old`).toBeLessThanOrEqual(365);
    }
  });

  it("refers only to errors and platforms that exist", () => {
    const slugs = ERRORS.map((e) => e.slug);
    const platforms = PLATFORMS.map((p) => p.slug);
    for (const e of ERRORS) {
      for (const r of e.related) expect(slugs, e.slug).toContain(r);
      expect(e.related, e.slug).not.toContain(e.slug);
      expect(new Set(e.related).size, e.slug).toBe(2);
      for (const p of e.platforms) expect(platforms, e.slug).toContain(p);
    }
  });
});

describe("error links (§7)", () => {
  const indexable = new Set(SITEMAP_SECTIONS.flatMap((s) => sitemapPages(s).map((p) => p.path)));

  it.each(ERRORS.map((e) => [e.slug, e] as const))("%s links to its tool and two related errors", (_, e) => {
    const hrefs = relatedLinks({ kind: "error", slug: e.slug }).map((l) => l.href);
    for (const h of hrefs) expect(indexable.has(h), h).toBe(true);
    expect(hrefs.filter((h) => h.startsWith("/errors/"))).toHaveLength(2);
    expect(hrefs.some((h) => h.startsWith("/tools/"))).toBe(e.tool !== null);
  });

  it("SSL errors link to the SSL checker", () => {
    for (const e of ERRORS.filter((e) => e.slug.startsWith("err-cert-")))
      expect(relatedLinks({ kind: "error", slug: e.slug }).map((l) => l.href)).toContain("/tools/ssl-checker");
  });

  it("every platform page links to at least one error, at most three", () => {
    for (const p of PLATFORMS) {
      const n = relatedLinks({ kind: "platform", slug: p.slug }).filter((l) => l.href.startsWith("/errors/")).length;
      expect(n, p.slug).toBeGreaterThanOrEqual(1);
      expect(n, p.slug).toBeLessThanOrEqual(3);
    }
  });
});
