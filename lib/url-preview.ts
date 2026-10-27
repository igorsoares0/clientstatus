// Browser-safe live hint for URL fields. The server (lib/url.ts) is the
// authority; this only previews what will be checked while typing.

export function previewSiteUrl(raw: string): { ok: true; text: string; https: boolean } | { ok: false } {
  const input = raw.trim();
  if (!input) return { ok: false };
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
    if (!url.hostname.includes(".") || /\s/.test(input)) return { ok: false };
    const host = url.hostname.replace(/^www\./, "");
    return { ok: true, text: `${url.protocol}//${host}`, https: url.protocol === "https:" };
  } catch {
    return { ok: false };
  }
}
