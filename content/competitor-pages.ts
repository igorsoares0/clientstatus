import { COMPETITORS, type Competitor, compareSlug, latestVerifiedAt } from "@/content/competitors";
import type { PageSeo, SitemapPage } from "@/lib/seo";

// Titles, descriptions and paths for /alternatives and /compare. The pages and the sitemaps both
// read from here, and tests/unit/competitors.test.ts checks every entry against the length rules.

export const ALTERNATIVES_HUB: PageSeo = {
  title: "Alternatives to uptime and WordPress tools",
  description:
    "How Client Status compares with uptime monitors and WordPress management tools for agencies: checks, client reports, branding and pricing, with sources.",
  path: "/alternatives",
};

export const COMPARE_HUB: PageSeo = {
  title: "Client Status vs other monitoring tools",
  absoluteTitle: true,
  description:
    "Side-by-side comparisons of Client Status with uptime monitors and WordPress management tools: features, client reports and pricing, with sources and dates.",
  path: "/compare",
};

export function alternativeSeo(c: Competitor): PageSeo {
  return {
    title: `${c.name} alternative for agencies`,
    description: c.altDescription,
    path: `/alternatives/${c.slug}`,
  };
}

export function compareSeo(c: Competitor): PageSeo {
  return {
    title: `Client Status vs ${c.name}: agency comparison`,
    absoluteTitle: true,
    description: c.compareDescription,
    path: `/compare/${compareSlug(c)}`,
  };
}

/** Every indexable page of a directory, for the sitemaps and the metadata tests. */
export function competitorPageSeo(section: "alternatives" | "compare"): (PageSeo & { lastModified: string })[] {
  const hub = section === "alternatives" ? ALTERNATIVES_HUB : COMPARE_HUB;
  const detail = section === "alternatives" ? alternativeSeo : compareSeo;
  return [
    { ...hub, lastModified: latestVerifiedAt() },
    ...COMPETITORS.map((c) => ({ ...detail(c), lastModified: c.verifiedAt })),
  ];
}

export function competitorPages(section: "alternatives" | "compare"): SitemapPage[] {
  return competitorPageSeo(section).map(({ path, lastModified }) => ({ path, lastModified }));
}
