import { Parser } from "htmlparser2";
import { normalizeCrawlUrl } from "@/lib/crawler/normalize";

// Extracts only what audits need from HTML (FR-CRAWL-09/12): no headless
// browser, and no page content is stored.

export type PageFacts = {
  title: string | null;
  metaDescription: string | null;
  /** Raw canonical href as written, and its resolved form (null if malformed). */
  canonicalRaw: string | null;
  canonical: string | null;
  h1Count: number;
  noindex: boolean;
  links: { url: string; nofollow: boolean }[];
  scriptCount: number;
  textLength: number;
  /** An empty SPA mount point (#root, #app, #__next…) — a sign content is rendered by JavaScript. */
  spaRoot: boolean;
};

const SPA_ROOT_IDS = new Set(["root", "app", "__next", "__nuxt", "___gatsby", "svelte"]);

export function extractPage(html: string, pageUrl: string): PageFacts {
  let title: string | null = null;
  let inTitle = false;
  let titleBuf = "";
  let metaDescription: string | null = null;
  let canonicalRaw: string | null = null;
  let h1Count = 0;
  let noindex = false;
  let base: string = pageUrl;
  let scriptCount = 0;
  let textLength = 0;
  let skipText = 0;
  let spaRoot = false;
  const hrefs: { href: string; nofollow: boolean }[] = [];

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (attrs.id && SPA_ROOT_IDS.has(attrs.id)) spaRoot = true;
        switch (name) {
          case "title":
            if (title === null) inTitle = true;
            break;
          case "meta": {
            const n = (attrs.name ?? "").toLowerCase();
            if (n === "description" && metaDescription === null) metaDescription = (attrs.content ?? "").trim();
            if (n === "robots" && /noindex/i.test(attrs.content ?? "")) noindex = true;
            break;
          }
          case "link":
            if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") && canonicalRaw === null) {
              canonicalRaw = (attrs.href ?? "").trim();
            }
            break;
          case "base":
            if (attrs.href) {
              try {
                base = new URL(attrs.href, pageUrl).href;
              } catch {
                /* keep page URL */
              }
            }
            break;
          case "h1":
            h1Count++;
            break;
          case "a":
            if (attrs.href !== undefined) {
              hrefs.push({
                href: attrs.href,
                nofollow: (attrs.rel ?? "").toLowerCase().split(/\s+/).includes("nofollow"),
              });
            }
            break;
          case "script":
            scriptCount++;
            skipText++;
            break;
          case "style":
          case "noscript":
            skipText++;
            break;
        }
      },
      ontext(text) {
        if (inTitle) titleBuf += text;
        else if (!skipText) textLength += text.trim().length;
      },
      onclosetag(name) {
        if (name === "title" && inTitle) {
          inTitle = false;
          title = titleBuf.replace(/\s+/g, " ").trim();
        }
        if (name === "script" || name === "style" || name === "noscript") skipText = Math.max(0, skipText - 1);
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();

  const seen = new Set<string>();
  const links: PageFacts["links"] = [];
  for (const h of hrefs) {
    const url = normalizeCrawlUrl(h.href, base);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ url, nofollow: h.nofollow });
    }
  }
  const raw = canonicalRaw as string | null;
  let canonical: string | null = null;
  if (raw) {
    try {
      const c = new URL(raw, base);
      canonical = c.protocol === "http:" || c.protocol === "https:" ? c.href : null;
    } catch {
      canonical = null;
    }
  }

  return {
    title,
    metaDescription,
    canonicalRaw: raw,
    canonical,
    h1Count,
    noindex,
    links,
    scriptCount,
    textLength,
    spaRoot,
  };
}
