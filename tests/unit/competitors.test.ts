import { describe, expect, it } from "vitest";
import { CLIENT_STATUS_NOTES, clientStatusPricing } from "@/content/client-status";
import { ALTERNATIVES_HUB, COMPARE_HUB, competitorPageSeo } from "@/content/competitor-pages";
import {
  COMPETITORS,
  compareSlug,
  competitorForCompareSlug,
  FEATURE_KEYS,
  getCompetitor,
  latestVerifiedAt,
  siblings,
} from "@/content/competitors";
import { PLANS } from "@/lib/plans";
import { metadataIssues, sitemapPages } from "@/lib/seo";

// docs/pseo-plan.md, Phase 2 checklist.

const MAX_AGE_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("competitor data", () => {
  it.each(COMPETITORS.map((c) => [c.slug, c] as const))(
    "%s has sources, a recent verifiedAt and an honest bestFor",
    (_, c) => {
      expect(c.sources.length).toBeGreaterThan(0);
      expect(c.bestFor.trim()).not.toBe("");
      const age = (Date.now() - Date.parse(`${c.verifiedAt}T00:00:00Z`)) / DAY_MS;
      expect(age, `${c.name} was verified ${Math.floor(age)} days ago; re-check its pages`).toBeLessThanOrEqual(
        MAX_AGE_DAYS,
      );
      expect(age).toBeGreaterThanOrEqual(-1);
    },
  );

  it("sources are on the competitor's own site", () => {
    for (const c of COMPETITORS) {
      const own = new URL(c.url).hostname
        .replace(/^www\./, "")
        .split(".")
        .slice(-2)
        .join(".");
      for (const s of c.sources) expect(new URL(s).hostname, `${c.name}: ${s}`).toContain(own.split(".")[0]);
    }
  });

  it("every partial value is explained by a note", () => {
    for (const c of COMPETITORS) {
      for (const k of FEATURE_KEYS) {
        if (c.features[k] === "partial") expect(c.featureNotes[k], `${c.name}.${k}`).toBeTruthy();
      }
    }
  });

  it("pages differ meaningfully: feature rows and copy aren't copies of each other", () => {
    const rows = new Set(COMPETITORS.map((c) => JSON.stringify(c.features)));
    // A few tools share the same yes/no pattern; most must not.
    expect(rows.size).toBeGreaterThanOrEqual(Math.ceil(COMPETITORS.length / 2));
    for (const field of ["whoItsFor", "bestFor", "summary", "pricingSummary"] as const) {
      const normalised = COMPETITORS.map((c) => c[field].replaceAll(c.name, "X"));
      expect(new Set(normalised).size, field).toBe(COMPETITORS.length);
    }
    const reasons = COMPETITORS.flatMap((c) => c.whyAgenciesSwitch.map((r) => r.replaceAll(c.name, "X")));
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("looks competitors up by slug and by compare slug", () => {
    const c = COMPETITORS[0];
    expect(getCompetitor(c.slug)).toBe(c);
    expect(compareSlug(c)).toBe(`client-status-vs-${c.slug}`);
    expect(competitorForCompareSlug(compareSlug(c))).toBe(c);
    expect(competitorForCompareSlug(c.slug)).toBeUndefined();
    expect(getCompetitor("nope")).toBeUndefined();
  });

  it("siblings stay in the category and exclude the page itself", () => {
    for (const c of COMPETITORS) {
      for (const s of siblings(c)) {
        expect(s.category).toBe(c.category);
        expect(s.slug).not.toBe(c.slug);
      }
    }
  });
});

describe("Client Status column", () => {
  it("reads prices and limits from lib/plans.ts", () => {
    const text = clientStatusPricing();
    for (const p of Object.values(PLANS)) {
      expect(text).toContain(`$${p.priceUsdMonthly}`);
      expect(text).toContain(String(p.maxActiveSites));
    }
    expect(CLIENT_STATUS_NOTES.brokenLinks).toContain(PLANS.pro.maxPagesPerAudit.toLocaleString("en-US"));
  });

  it("doesn't claim features that haven't shipped", () => {
    const all = Object.values(CLIENT_STATUS_NOTES).join(" ").toLowerCase();
    for (const unshipped of ["status page", "slack", "sms", "team invite", "custom domain"]) {
      expect(all).not.toContain(unshipped);
    }
  });
});

describe("competitor page metadata", () => {
  const pages = [...competitorPageSeo("alternatives"), ...competitorPageSeo("compare")];

  it.each(pages.map((p) => [p.path, p] as const))("%s meets the title and description rules", (_, p) => {
    expect(metadataIssues(p)).toEqual([]);
  });

  it("titles and descriptions are unique", () => {
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
  });

  it("sitemaps list the hubs and every competitor, dated by verification", () => {
    const alt = sitemapPages("alternatives");
    const cmp = sitemapPages("compare");
    expect(alt.map((p) => p.path)).toContain(ALTERNATIVES_HUB.path);
    expect(cmp.map((p) => p.path)).toContain(COMPARE_HUB.path);
    expect(alt).toHaveLength(COMPETITORS.length + 1);
    expect(cmp).toHaveLength(COMPETITORS.length + 1);
    expect(alt[0].lastModified).toBe(latestVerifiedAt());
  });
});
