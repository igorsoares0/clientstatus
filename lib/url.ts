import { isIP } from "node:net";
import { parse as parseDomain } from "tldts";

// Website address normalization and input-time safety checks (FR-SITE-02/03,
// spec §8.1). This is the first line of defence only: the outbound fetch layer
// (Phase 3) must still resolve DNS and re-check every address and redirect.

export type NormalizedUrl = {
  /** Canonical URL that checks request, e.g. "https://shop.example.com/book". */
  baseUrl: string;
  /** Lowercase hostname without a leading "www." — a site's identity. */
  hostname: string;
  /** eTLD+1, e.g. "example.co.uk". */
  registrableDomain: string;
  https: boolean;
};

export type UrlResult = { ok: true; value: NormalizedUrl } | { ok: false; error: string; blocked?: boolean };

const MAX_URL_LENGTH = 2048;
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  if (v.startsWith("ff")) return true; // multicast
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

/** True for loopback, private, link-local, multicast and reserved IP literals. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return false;
}

export function normalizeSiteUrl(raw: string): UrlResult {
  let input = raw.trim();
  if (!input) return { ok: false, error: "URL is required" };
  if (input.length > MAX_URL_LENGTH) return { ok: false, error: "Address is too long" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "Not a valid web address" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `${url.protocol.replace(":", "")}:// isn’t supported — http or https only` };
  }
  if (url.username || url.password) return { ok: false, error: "Contains a username or password" };

  const host = url.hostname.replace(/\.$/, "");
  const bareIp = host.replace(/^\[|\]$/g, "");
  if (isIP(bareIp)) {
    return isPrivateIp(bareIp)
      ? { ok: false, error: "Private or local address — blocked for safety", blocked: true }
      : { ok: false, error: "Use the website’s domain name, not an IP address" };
  }
  if (host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: "Private or local address — blocked for safety", blocked: true };
  }
  if (!host.includes(".")) return { ok: false, error: "Needs a public domain name" };

  const parsed = parseDomain(host, { allowPrivateDomains: false });
  if (!parsed.domain || !parsed.isIcann) return { ok: false, error: "Needs a public domain name" };

  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const port = url.port ? `:${url.port}` : "";
  return {
    ok: true,
    value: {
      baseUrl: `${url.protocol}//${host}${port}${path}${url.search}`,
      hostname: host.replace(/^www\./, ""),
      registrableDomain: parsed.domain,
      https: url.protocol === "https:",
    },
  };
}

/** Display name used when the user doesn't give one. */
export function defaultSiteName(url: NormalizedUrl): string {
  return url.hostname;
}
