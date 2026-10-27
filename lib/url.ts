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
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, documentation
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast and reserved
  );
}

/** Expands any valid IPv6 literal (compressed, mixed dotted form) to eight 16-bit groups. */
function ipv6Groups(ip: string): number[] {
  let v = ip.toLowerCase().split("%")[0]!;
  const dotted = v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    v = `${v.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = v.includes("::") ? v.split("::") : [v, undefined];
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? [] : tail ? tail.split(":") : [];
  const zeros = tail === undefined ? [] : Array(8 - h.length - t.length).fill("0");
  return [...h, ...zeros, ...t].map((g) => parseInt(g, 16));
}

const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroPrefix(8)) return true; // ::
  if (zeroPrefix(7) && g[7] === 1) return true; // ::1
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && zeroPrefix(4)) return true; // discard-only 100::/64
  // IPv4 embedded in IPv6: mapped ::ffff:a.b.c.d, compatible ::a.b.c.d, NAT64 64:ff9b::/96 and 6to4 2002::/16.
  if (zeroPrefix(5) && (g[5] === 0xffff || g[5] === 0)) return isPrivateIPv4(v4(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateIPv4(v4(g[6]!, g[7]!));
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1]!, g[2]!));
  return false;
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
