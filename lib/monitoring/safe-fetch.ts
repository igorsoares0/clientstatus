import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { Agent, request, errors as undiciErrors } from "undici";
import { isPrivateIp } from "@/lib/url";

// Outbound HTTP for checks against user-supplied URLs (spec §8.1).
// - Addresses are validated at connect time inside the socket lookup, so a DNS
//   answer can't change between validation and connection (rebinding).
// - Every redirect hop is re-validated; credentials and non-HTTP schemes are refused.
// - Response bytes, redirect count and total time are bounded.

export const USER_AGENT = "ClientStatusBot/1.0 (+https://clientstatus.app/bot)";

export class BlockedAddressError extends Error {
  constructor(readonly host: string) {
    super(`Blocked address for ${host}`);
    this.name = "BlockedAddressError";
  }
}

export class RedirectError extends Error {
  constructor(
    message: string,
    readonly kind: "too_many" | "loop" | "invalid",
  ) {
    super(message);
    this.name = "RedirectError";
  }
}

type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const systemResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  );

/** A socket lookup that refuses private, loopback, link-local and reserved addresses. */
export function guardedLookup(resolver: Resolver = systemResolver, allowPrivate = false): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname)
      .then((addresses) => {
        const usable = allowPrivate ? addresses : addresses.filter((a) => !isPrivateIp(a.address));
        if (usable.length === 0 || (!allowPrivate && usable.length !== addresses.length)) {
          throw new BlockedAddressError(hostname);
        }
        const family = (options as { family?: number }).family;
        const matching = family ? usable.filter((a) => a.family === family) : usable;
        // Use IPv4 when available. Node's happy-eyeballs gives each address only 250 ms, so a distant
        // server's IPv4 handshake gets abandoned for an IPv6 route that many networks can't actually use.
        const pool = matching.length ? matching : usable;
        const v4 = pool.filter((a) => a.family === 4);
        const list = v4.length ? v4 : pool;
        if ((options as { all?: boolean }).all) callback(null, list);
        else callback(null, list[0].address, list[0].family);
      })
      .catch((err) => callback(err as NodeJS.ErrnoException, "", 0));
  };
}

export type SafeFetchOptions = {
  timeoutMs: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Test seam: custom DNS. */
  resolver?: Resolver;
  /** Test seam only — never enabled for user URLs. */
  allowPrivate?: boolean;
};

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  redirects: number;
  durationMs: number;
  /** Lowercased header subset needed for classification. */
  headers: { server?: string; contentType?: string; cfMitigated?: string; location?: string };
  /** Up to maxBytes of the body as text, for bot-challenge detection only. Never stored. */
  bodySnippet: string;
};

const agents = new Map<string, Agent>();

function agentFor(resolver: Resolver | undefined, allowPrivate: boolean, timeoutMs: number) {
  const key = `${resolver ? "custom" : "system"}:${allowPrivate}:${timeoutMs}`;
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({
      // Certificate validity is the SSL check's job; uptime only asks whether the server answers.
      connect: { lookup: guardedLookup(resolver, allowPrivate), timeout: timeoutMs, rejectUnauthorized: false },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connections: 8,
    });
    if (!resolver) agents.set(key, agent);
  }
  return agent;
}

function headerValue(h: string | string[] | undefined): string | undefined {
  return Array.isArray(h) ? h[0] : h;
}

/** GET with redirect following; throws on network/TLS/blocked/timeout errors. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const dispatcher = agentFor(opts.resolver, opts.allowPrivate ?? false, opts.timeoutMs);
  try {
    return await fetchWith(dispatcher, rawUrl, opts);
  } finally {
    // Per-call agents (custom resolvers in tests) must not leak sockets.
    if (opts.resolver) await dispatcher.close();
  }
}

async function fetchWith(dispatcher: Agent, rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const started = performance.now();
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  const seen = new Set<string>();
  let url = new URL(rawUrl);

  for (let hop = 0; ; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new RedirectError("Redirect to a non-HTTP address", "invalid");
    if (url.username || url.password) throw new RedirectError("Redirect to an address with credentials", "invalid");
    if (seen.has(url.href)) throw new RedirectError("Redirect loop", "loop");
    seen.add(url.href);
    // IP literals never reach the socket lookup, so check them here.
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !opts.allowPrivate && isPrivateIp(literal)) throw new BlockedAddressError(literal);

    const res = await request(url, {
      method: "GET",
      dispatcher,
      signal: deadline,
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
    });
    // Response time = time to the final response's headers (incl. redirects), not body download.
    const headersAt = performance.now();
    const location = headerValue(res.headers.location);
    if (res.statusCode >= 300 && res.statusCode < 400 && location) {
      await res.body.dump();
      if (hop >= maxRedirects) throw new RedirectError(`More than ${maxRedirects} redirects`, "too_many");
      try {
        url = new URL(location, url);
      } catch {
        throw new RedirectError("Invalid redirect location", "invalid");
      }
      continue;
    }

    let bodySnippet = "";
    let received = 0;
    for await (const chunk of res.body) {
      const buf = chunk as Buffer;
      const room = maxBytes - received;
      if (room > 0) bodySnippet += buf.subarray(0, room).toString("utf8");
      received += buf.length;
      if (received >= maxBytes) break;
    }
    if (received >= maxBytes) res.body.destroy();

    return {
      finalUrl: url.href,
      status: res.statusCode,
      redirects: hop,
      durationMs: Math.round(headersAt - started),
      headers: {
        server: headerValue(res.headers.server)?.toLowerCase(),
        contentType: headerValue(res.headers["content-type"])?.toLowerCase(),
        cfMitigated: headerValue(res.headers["cf-mitigated"])?.toLowerCase(),
        location,
      },
      bodySnippet,
    };
  }
}

export { undiciErrors };
