import { TOOL_CRAWL_MAX_PAGES } from "@/lib/tools/crawl-limits";
import type { ToolSlug } from "@/lib/tools/limits";
import type { PageSeo, SitemapPage } from "@/lib/seo";

// Titles, descriptions and paths for /tools, without the page copy, so lib/seo.ts (and through it
// the root layout) can list them without loading the crawler. Checked by tests/unit/tools.test.ts.

export const TOOLS_UPDATED = "2026-11-22";

export const TOOLS_HUB: PageSeo = {
  title: "Free website tools for agencies",
  description:
    "Free tools for agencies that look after client websites: SSL certificate checker, domain expiry lookup, broken link checker and a sample health report.",
  path: "/tools",
};

export const TOOL_SEO: Record<ToolSlug, PageSeo> = {
  "ssl-checker": {
    title: "Free SSL certificate checker",
    description:
      "Check any website’s SSL certificate: issuer, expiry date, days left, hostname match and trust chain, plus when an agency should be warned before it expires.",
    path: "/tools/ssl-checker",
  },
  "domain-expiry-checker": {
    title: "Free domain expiry checker",
    description:
      "See when a domain registration expires, read live from the registry over RDAP, with the registrar and an honest n/a when the registry doesn’t publish a date.",
    path: "/tools/domain-expiry-checker",
  },
  "broken-link-checker": {
    title: "Free broken link checker",
    description: `Find broken links on any website: we crawl up to ${TOOL_CRAWL_MAX_PAGES} pages, check every link twice before calling it broken, and show the page where each one appears.`,
    path: "/tools/broken-link-checker",
  },
  "website-health-report": {
    title: "Free website health report (PDF)",
    description:
      "Enter a website and get a sample health report by email: uptime, SSL certificate, domain expiry and a quick audit, in the PDF format agencies send clients.",
    path: "/tools/website-health-report",
  },
};

export function toolPages(): SitemapPage[] {
  return [TOOLS_HUB, ...Object.values(TOOL_SEO)].map((p) => ({ path: p.path, lastModified: TOOLS_UPDATED }));
}
