import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETITORS } from "@/content/competitors";
import { PLATFORMS, PLATFORMS_HUB } from "@/content/platforms";
import { REPORT_PAGES, SAMPLE_PDF, TEMPLATES, TEMPLATES_HUB } from "@/content/templates";
import { TOOL_SLUGS } from "@/lib/tools/limits";
import { SAMPLE_REPORT } from "@/lib/reports/fixtures";
import { metadataIssues, SITEMAP_SECTIONS, sitemapPages } from "@/lib/seo";
import { relatedLinks } from "@/lib/seo-links";

// docs/pseo-plan.md, Phase 4: report templates, platform pages and the internal linking map (§7).

const DAY_MS = 86_400_000;
const publicFile = (p: string) => path.join(import.meta.dirname, "../../public", p);

describe("report templates", () => {
  it.each([TEMPLATES_HUB, ...TEMPLATES.map((t) => t.seo)].map((p) => [p.path, p] as const))(
    "%s meets the title and description rules",
    (_, p) => expect(metadataIssues(p)).toEqual([]),
  );

  it("every template's images and the sample PDF exist (npm run landing:images)", () => {
    for (const img of Object.values(REPORT_PAGES)) expect(existsSync(publicFile(img.src)), img.src).toBe(true);
    expect(existsSync(publicFile(SAMPLE_PDF))).toBe(true);
  });

  it("each template leads with its own pages and its own explanation", () => {
    const leads = new Set(TEMPLATES.map((t) => t.pages.join(",")));
    expect(leads.size).toBe(TEMPLATES.length);
    const headings = TEMPLATES.flatMap((t) => t.sections.map((s) => s.heading));
    expect(new Set(headings).size).toBe(headings.length);
    for (const t of TEMPLATES) {
      expect(t.sections.length, t.slug).toBeGreaterThanOrEqual(2);
      for (const s of t.sections) expect(t.pages, `${t.slug}: ${s.page}`).toContain(s.page);
      for (const tool of t.tools) expect(TOOL_SLUGS).toContain(tool);
    }
  });

  it("never promises free-text notes in the report", () => {
    const copy = JSON.stringify(TEMPLATES).toLowerCase();
    expect(copy).not.toMatch(/add (your )?(own )?notes? (to|in) the report/);
  });

  it("the sample report is shaped like real product output", () => {
    expect(SAMPLE_REPORT.openItems.every((o) => ["Open", "Being worked on"].includes(o.status))).toBe(true);
    expect(SAMPLE_REPORT.dates.every((d) => /^(SSL certificate|Domain registration) expires — /.test(d.text))).toBe(
      true,
    );
    for (const s of SAMPLE_REPORT.sites) expect(s.host).toMatch(/\.example$/);
  });
});

describe("platform pages", () => {
  it.each([PLATFORMS_HUB, ...PLATFORMS.map((p) => p.seo)].map((p) => [p.path, p] as const))(
    "%s meets the title and description rules",
    (_, p) => expect(metadataIssues(p)).toEqual([]),
  );

  it("every platform cites its own documentation and was checked recently", () => {
    for (const p of PLATFORMS) {
      expect(p.sources.length, p.slug).toBeGreaterThan(0);
      for (const s of p.sources)
        expect(new URL(s).hostname, s).toContain(p.slug === "wordpress" ? "wordpress.org" : p.slug);
      const age = (Date.now() - Date.parse(`${p.verifiedAt}T00:00:00Z`)) / DAY_MS;
      expect(age, `${p.name} facts are ${Math.floor(age)} days old`).toBeLessThanOrEqual(120);
    }
  });

  it("copy is platform-specific, not a find/replace of the name", () => {
    for (const field of ["failures", "packaging", "intro"] as const) {
      const normalised = PLATFORMS.map((p) => JSON.stringify(p[field]).replaceAll(p.name, "X"));
      expect(new Set(normalised).size, field).toBe(PLATFORMS.length);
    }
    const failureTitles = PLATFORMS.flatMap((p) => p.failures.map((f) => f.title));
    expect(new Set(failureTitles).size).toBe(failureTitles.length);
    for (const p of PLATFORMS) {
      expect(p.failures.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.limits.length, p.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("refers only to competitors and templates that exist", () => {
    for (const p of PLATFORMS) {
      for (const a of p.alternatives)
        expect(
          COMPETITORS.map((c) => c.slug),
          p.slug,
        ).toContain(a);
      for (const t of p.templates)
        expect(
          TEMPLATES.map((x) => x.slug),
          p.slug,
        ).toContain(t);
    }
  });
});

describe("internal links (§7)", () => {
  const indexable = new Set(SITEMAP_SECTIONS.flatMap((s) => sitemapPages(s).map((p) => p.path)));
  const refs = [
    ...COMPETITORS.map((c) => ({ kind: "competitor" as const, slug: c.slug })),
    ...PLATFORMS.map((p) => ({ kind: "platform" as const, slug: p.slug })),
    ...TEMPLATES.map((t) => ({ kind: "template" as const, slug: t.slug })),
  ];

  it.each(refs.map((r) => [`${r.kind}:${r.slug}`, r] as const))("%s links only to indexable pages", (_, r) => {
    const links = relatedLinks(r);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(indexable.has(l.href), l.href).toBe(true);
    expect(new Set(links.map((l) => l.href)).size).toBe(links.length);
  });

  it("WordPress tools link to the WordPress page, their comparison and two templates", () => {
    const hrefs = relatedLinks({ kind: "competitor", slug: "managewp" }).map((l) => l.href);
    expect(hrefs).toContain("/for/wordpress");
    expect(hrefs).toContain("/compare/client-status-vs-managewp");
    expect(hrefs.filter((h) => h.startsWith("/templates/"))).toHaveLength(2);
  });

  it("templates link to the tools that produce their data", () => {
    const hrefs = relatedLinks({ kind: "template", slug: "ssl-certificate-report" }).map((l) => l.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/tools/ssl-checker", "/tools/domain-expiry-checker"]));
  });

  it("unknown pages get no links", () => {
    expect(relatedLinks({ kind: "platform", slug: "nope" })).toEqual([]);
  });
});
