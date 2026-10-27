import { formatLongDate } from "@/lib/format";
import type { CheckStatus, DomainState } from "@/lib/generated/prisma/enums";

// Domain expiry from RDAP (FR-DNS-02/03/06). The IANA bootstrap file maps TLDs
// to registry RDAP servers. When a registry doesn't publish an expiry date we
// say so — we never estimate one.

export const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
export const DOMAIN_THRESHOLD_DAYS = 30;

export type Bootstrap = Map<string, string>;

export function parseBootstrap(json: unknown): Bootstrap {
  const map: Bootstrap = new Map();
  const services = (json as { services?: [string[], string[]][] })?.services ?? [];
  for (const [tlds, urls] of services) {
    const url = urls.find((u) => u.startsWith("https://")) ?? urls[0];
    if (!url) continue;
    for (const tld of tlds) map.set(tld.toLowerCase(), url.endsWith("/") ? url : `${url}/`);
  }
  return map;
}

export function rdapServerFor(domain: string, bootstrap: Bootstrap): string | null {
  const labels = domain.toLowerCase().split(".");
  // Longest match first (e.g. a server registered for "co.uk" over "uk").
  for (let i = 1; i < labels.length; i++) {
    const suffix = labels.slice(i).join(".");
    const server = bootstrap.get(suffix);
    if (server) return server;
  }
  return null;
}

export type DomainResult = {
  status: CheckStatus;
  state: DomainState;
  expiresAt: Date | null;
  source: string | null;
  daysLeft: number | null;
  summary: string;
};

type RdapEntity = { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] };

function registrarName(json: { entities?: RdapEntity[] }): string | null {
  const registrar = json.entities?.find((e) => e.roles?.includes("registrar"));
  const fn = registrar?.vcardArray?.[1]?.find((f) => f[0] === "fn");
  return typeof fn?.[3] === "string" ? fn[3] : null;
}

export function parseRdapDomain(json: unknown, sourceHost: string, now: Date, timeZone = "UTC"): DomainResult {
  const data = json as { events?: { eventAction?: string; eventDate?: string }[]; entities?: RdapEntity[] };
  const event = data.events?.find((e) => e.eventAction === "expiration");
  const source = registrarName(data) ? `${sourceHost} RDAP (registrar: ${registrarName(data)})` : `${sourceHost} RDAP`;
  if (!event?.eventDate || Number.isNaN(Date.parse(event.eventDate))) {
    return {
      status: "success",
      state: "unsupported",
      expiresAt: null,
      source,
      daysLeft: null,
      summary: "n/a — expiry not published by the registry",
    };
  }
  const expiresAt = new Date(event.eventDate);
  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  const date = formatLongDate(expiresAt, timeZone);
  if (daysLeft <= DOMAIN_THRESHOLD_DAYS) {
    return {
      status: "success",
      state: "expiring",
      expiresAt,
      source,
      daysLeft,
      summary: `Registration expires ${date} (${Math.max(daysLeft, 0)} days)`,
    };
  }
  return { status: "success", state: "ok", expiresAt, source, daysLeft, summary: `Registered until ${date}` };
}

export type JsonFetcher = (url: string) => Promise<{ status: number; json: unknown }>;

let cachedBootstrap: { at: number; map: Bootstrap } | null = null;
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

export async function loadBootstrap(fetchJson: JsonFetcher, now = Date.now()): Promise<Bootstrap> {
  if (cachedBootstrap && now - cachedBootstrap.at < BOOTSTRAP_TTL_MS) return cachedBootstrap.map;
  const res = await fetchJson(IANA_BOOTSTRAP_URL);
  if (res.status !== 200) throw new Error(`IANA bootstrap returned HTTP ${res.status}`);
  cachedBootstrap = { at: now, map: parseBootstrap(res.json) };
  return cachedBootstrap.map;
}

export async function lookupDomainExpiry(
  domain: string,
  fetchJson: JsonFetcher,
  now = new Date(),
  timeZone = "UTC",
): Promise<DomainResult> {
  const error = (summary: string): DomainResult => ({
    status: "inconclusive",
    state: "error",
    expiresAt: null,
    source: null,
    daysLeft: null,
    summary,
  });
  let bootstrap: Bootstrap;
  try {
    bootstrap = await loadBootstrap(fetchJson, now.getTime());
  } catch {
    return error("Couldn’t load the RDAP registry list — will retry");
  }
  const server = rdapServerFor(domain, bootstrap);
  if (!server) {
    return {
      status: "success",
      state: "unsupported",
      expiresAt: null,
      source: null,
      daysLeft: null,
      summary: "n/a — this registry doesn’t offer RDAP",
    };
  }
  const host = new URL(server).hostname;
  try {
    const res = await fetchJson(`${server}domain/${encodeURIComponent(domain)}`);
    if (res.status === 404) return error(`${host} has no record for ${domain}`);
    if (res.status === 429) return error(`${host} rate-limited the lookup — will retry`);
    if (res.status !== 200) return error(`${host} returned HTTP ${res.status}`);
    return parseRdapDomain(res.json, host, now, timeZone);
  } catch {
    return error(`Couldn’t reach ${host} — will retry`);
  }
}
