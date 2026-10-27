// URL normalization for crawling (FR-CRAWL-04): resolve relative links, drop
// fragments and default ports, lowercase the host, so the same page is only
// visited once.

const SKIP_SCHEMES = /^(mailto|tel|javascript|data|sms|ftp|file|blob|about):/i;

export function normalizeCrawlUrl(href: string, base: string | URL): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || SKIP_SCHEMES.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))
    url.port = "";
  return url.href;
}

/** Same site = same hostname, treating "www." as equivalent. */
export function sameSite(a: string | URL, b: string | URL): boolean {
  const host = (u: string | URL) => new URL(u).hostname.replace(/^www\./, "");
  return host(a) === host(b);
}

/** Paths that are almost never HTML pages — linked to, but not crawled as pages. */
export function looksLikeAsset(url: string): boolean {
  return /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|gz|mp4|mp3|mov|avi|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i.test(
    new URL(url).pathname,
  );
}
