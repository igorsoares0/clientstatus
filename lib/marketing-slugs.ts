import { COMPETITORS, compareSlug } from "@/content/competitors";
import { ERRORS } from "@/content/errors";
import { PLATFORMS } from "@/content/platforms";
import { TEMPLATES } from "@/content/templates";
import { TLDS } from "@/content/tlds";

// The slugs each SEO detail page prerenders (same lists as their generateStaticParams). proxy.ts uses
// them to answer unknown slugs with a real 404: with Cache Components the page sends its shell with a
// 200 before notFound() runs, even with `instant = false` (Next.js docs, loading.js "Status codes").
const DETAIL_SLUGS: Record<string, ReadonlySet<string>> = {
  "/alternatives": new Set(COMPETITORS.map((c) => c.slug)),
  "/compare": new Set(COMPETITORS.map(compareSlug)),
  "/domain-expiry": new Set(TLDS.map((t) => t.tld)),
  "/errors": new Set(ERRORS.map((e) => e.slug)),
  "/for": new Set(PLATFORMS.map((p) => p.slug)),
  "/templates": new Set(TEMPLATES.map((t) => t.slug)),
};

/** True for `/<prefix>/<slug>` on a slug-based SEO page whose slug doesn't exist. */
export function isUnknownMarketingSlug(pathname: string): boolean {
  const match = /^(\/[^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return false;
  const slugs = DETAIL_SLUGS[match[1]];
  if (!slugs) return false;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return true;
  }
  return !slugs.has(slug);
}
