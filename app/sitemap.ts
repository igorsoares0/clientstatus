import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo";

// Core pages. Each marketing directory has its own sitemap (app/(marketing)/<section>/sitemap.ts),
// all listed in robots.txt, so Search Console reports indexing per section.

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries("core");
}
