import type { Metadata, MetadataRoute } from "next";
import { competitorPages } from "@/content/competitor-pages";
import { errorPages } from "@/content/errors";
import { platformPages } from "@/content/platforms";
import { templatePages } from "@/content/templates";
import { domainExpiryPages } from "@/content/tlds";
import { toolPages } from "@/content/tool-seo";
import { LEGAL_PAGES, LEGAL_UPDATED } from "@/lib/legal";
import { MARKETING_PREFIXES, type MarketingPrefix } from "@/lib/marketing-paths";

export { MARKETING_PREFIXES };

// Shared SEO plumbing for the public marketing pages (docs/pseo-plan.md): canonical URLs, page
// metadata with length rules, the per-section sitemaps and the hubs linked from the footer.
// No "server-only": the root layout, sitemap, robots and unit tests all import it.

/** Public origin used for canonicals, sitemaps and JSON-LD. Read at build time for static pages. */
export const SITE_URL = (process.env.SITE_URL?.trim() || "https://useclientstatus.com").replace(/\/+$/, "");

export const SITE_NAME = "Client Status";

/** Rendered as "<title> · Client Status" by the root layout's title template. */
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;

/** Absolute URL for a site path ("/alternatives" → "https://useclientstatus.com/alternatives"). */
export function absoluteUrl(path: string): string {
  if (!path.startsWith("/")) throw new Error(`Path must start with "/": ${path}`);
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export type PageSeo = {
  /** Page title without the " · Client Status" suffix (unless `absoluteTitle`). */
  title: string;
  /** Use the title as-is, e.g. when it already names Client Status ("Client Status vs …"). */
  absoluteTitle?: boolean;
  description: string;
  /** Site path of the page, e.g. "/alternatives/uptimerobot". Becomes the canonical. */
  path: string;
  /** Site path or absolute URL of a social preview image. */
  ogImage?: string;
  /** Rendered but kept out of search results (and out of the sitemaps). */
  noindex?: boolean;
};

/** The title as browsers and search results show it (root layout template applied). */
export function fullTitle(title: string, absoluteTitle = false): string {
  return absoluteTitle ? title : `${title}${TITLE_SUFFIX}`;
}

/** Rule violations for a page's title and description; empty when it's fine. */
export function metadataIssues({
  title,
  description,
  absoluteTitle,
}: Pick<PageSeo, "title" | "description" | "absoluteTitle">): string[] {
  const issues: string[] = [];
  const rendered = fullTitle(title, absoluteTitle);
  if (!title.trim()) issues.push("title is empty");
  if (rendered.length > TITLE_MAX) issues.push(`title is ${rendered.length} chars as rendered (max ${TITLE_MAX})`);
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    issues.push(`description is ${description.length} chars (want ${DESCRIPTION_MIN}–${DESCRIPTION_MAX})`);
  }
  return issues;
}

/** Metadata for an indexable marketing page: absolute canonical, Open Graph and Twitter card. */
export function pageMetadata({ title, description, path, ogImage, absoluteTitle, noindex }: PageSeo): Metadata {
  const url = absoluteUrl(path);
  const shown = fullTitle(title, absoluteTitle);
  const images = ogImage ? [{ url: ogImage.startsWith("/") ? absoluteUrl(ogImage) : ogImage }] : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: shown,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title: shown, description, images },
  };
}

// --- Sitemaps -------------------------------------------------------------------------------------

/**
 * One sitemap per directory, so Search Console reports indexing per section: /sitemap.xml for the
 * core pages (app/sitemap.ts) and /<section>/sitemap.xml from app/(marketing)/<section>/sitemap.ts.
 * Next.js reserves /sitemap.xml for app/sitemap.ts, so there is no sitemap index; robots.txt lists them all.
 */
export const SITEMAP_SECTIONS = [
  "core",
  "alternatives",
  "compare",
  "templates",
  "tools",
  "domain-expiry",
  "for",
  "errors",
] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export type SitemapPage = { path: string; lastModified?: string };

/**
 * Indexable pages per section. Only pages meant for search results belong here (no noindex pages,
 * no app or report URLs). Each new directory adds its data loader here and a sitemap.ts that
 * returns sitemapEntries("<section>"); a unit test checks the file exists once the section has pages.
 */
const SECTION_PAGES: Record<SitemapSection, () => SitemapPage[]> = {
  core: () => [
    { path: "/" },
    ...LEGAL_PAGES.map((p) => ({ path: p.href, lastModified: LEGAL_UPDATED })),
    { path: "/bot" },
  ],
  alternatives: () => competitorPages("alternatives"),
  compare: () => competitorPages("compare"),
  templates: () => templatePages(),
  tools: () => toolPages(),
  "domain-expiry": () => domainExpiryPages(),
  for: () => platformPages(),
  errors: () => errorPages(),
};

export function sitemapPages(section: SitemapSection): SitemapPage[] {
  return SECTION_PAGES[section]();
}

/** Sections that have at least one indexable page; only these are listed in robots.txt. */
export function activeSitemapSections(): SitemapSection[] {
  return SITEMAP_SECTIONS.filter((s) => sitemapPages(s).length > 0);
}

/** Site path of a section's sitemap. */
export function sitemapPath(section: SitemapSection): string {
  return section === "core" ? "/sitemap.xml" : `/${section}/sitemap.xml`;
}

export function sitemapEntries(section: SitemapSection): MetadataRoute.Sitemap {
  return sitemapPages(section).map((p) => ({ url: absoluteUrl(p.path), lastModified: p.lastModified }));
}

// --- Robots ---------------------------------------------------------------------------------------

/** Private report links, API, internal pages and the signed-in app. Marketing prefixes stay crawlable. */
export const ROBOTS_DISALLOW = [
  "/r/",
  "/api/",
  "/ops",
  "/onboarding",
  "/overview",
  "/websites",
  "/clients",
  "/incidents",
  "/reports",
  "/settings",
  "/billing",
  "/team",
] as const;

export function robotsConfig(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] },
    sitemap: activeSitemapSections().map((s) => absoluteUrl(sitemapPath(s))),
  };
}

// --- Hubs -----------------------------------------------------------------------------------------

/** Hub pages listed under "Resources" in the footer. Add each hub when its page ships. */
export const RESOURCE_HUBS: readonly { href: MarketingPrefix; label: string }[] = [
  { href: "/alternatives", label: "Alternatives" },
  { href: "/compare", label: "Comparisons" },
  { href: "/tools", label: "Free tools" },
  { href: "/templates", label: "Report templates" },
  { href: "/for", label: "Platforms" },
  { href: "/domain-expiry", label: "Domain expiry by TLD" },
  { href: "/errors", label: "Error glossary" },
];
