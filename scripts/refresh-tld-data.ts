import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { IANA_BOOTSTRAP_URL, lookupDomainExpiry, parseBootstrap, rdapServerFor } from "@/lib/monitoring/rdap";
import { rdapFetcher } from "@/lib/monitoring/rdap-fetch";
import { USER_AGENT } from "@/lib/monitoring/safe-fetch";

// Refreshes the data behind /domain-expiry/[tld] (docs/pseo-plan.md §4.2) so builds are deterministic:
//   npx tsx scripts/refresh-tld-data.ts
// 1. Snapshots IANA's RDAP bootstrap to content/rdap-bootstrap.json.
// 2. For each TLD in WAVE, reads its category and manager from IANA's root zone database.
// 3. Looks up one known domain per TLD over RDAP, exactly as the product does, and records
//    whether the registry publishes an expiry date.
// Review the diff before committing: a TLD whose lookup failed keeps "failed" and isn't indexed.

/** Wave 1: high-usage TLDs. Second-level zones (.co.uk, .com.br, .com.au) are covered by their TLD. */
export const WAVE = [
  "com",
  "net",
  "org",
  "info",
  "biz",
  "io",
  "co",
  "app",
  "dev",
  "ai",
  "xyz",
  "me",
  "tv",
  "us",
  "ca",
  "uk",
  "ie",
  "de",
  "fr",
  "nl",
  "be",
  "es",
  "it",
  "eu",
  "ch",
  "at",
  "se",
  "pl",
  "br",
  "au",
  "nz",
  "in",
];

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function text(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

function decode(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Category ("Generic top-level domain", "Country-code top-level domain", …) and manager from the IANA page. */
export function parseRootZonePage(html: string): { category: string | null; manager: string | null } {
  const category = html.match(/domain-[a-z-]+\.[0-9a-f]+\.svg" alt="">\s*<\/span>\s*([^<]+?)\s*<\/span>/i)?.[1];
  const managerBlock = html.split(/tld-label muted">\s*Manager\s*</i)[1];
  const manager = managerBlock?.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1];
  return { category: category ? decode(category) : null, manager: manager ? decode(manager) : null };
}

/**
 * Known registered domains to test with. The registry's own nic.<tld> can be a special record
 * (nic.uk has no expiry date while ordinary .uk domains do), so it's never the only evidence.
 */
function candidates(tld: string) {
  const names = ["nic", "google", "wikipedia", "amazon"];
  return [
    ...names.map((n) => `${n}.${tld}`),
    ...["com", "co"].flatMap((sl) => names.slice(1).map((n) => `${n}.${sl}.${tld}`)),
  ];
}

type TestResult =
  | { result: "published"; domain: string; expiresAt: string }
  | { result: "not-published"; domain: string; domains: string[] }
  | { result: "no-rdap"; domain: null }
  | { result: "failed"; domain: string | null; detail: string };

/** "published" as soon as one domain has a date; "not-published" only when two or more answered without one. */
async function test(tld: string, hasRdap: boolean): Promise<TestResult> {
  if (!hasRdap) return { result: "no-rdap", domain: null };
  const fetchJson = rdapFetcher();
  const withoutDate: string[] = [];
  let last = "no candidate answered";
  for (const domain of candidates(tld)) {
    const r = await lookupDomainExpiry(domain, fetchJson);
    await sleep(DELAY_MS);
    if (r.status === "inconclusive") {
      last = r.summary;
      continue;
    }
    if (r.expiresAt) return { result: "published", domain, expiresAt: r.expiresAt.toISOString().slice(0, 10) };
    withoutDate.push(domain);
  }
  if (withoutDate.length >= 2) return { result: "not-published", domain: withoutDate[0]!, domains: withoutDate };
  return {
    result: "failed",
    domain: withoutDate[0] ?? null,
    detail: withoutDate.length ? `only ${withoutDate[0]} answered, without a date` : last,
  };
}

async function main() {
  const checkedAt = new Date().toISOString().slice(0, 10);
  const bootstrapJson = JSON.parse(await text(IANA_BOOTSTRAP_URL)) as { publication?: string };
  writeFileSync("content/rdap-bootstrap.json", `${JSON.stringify(bootstrapJson, null, 2)}\n`);
  const bootstrap = parseBootstrap(bootstrapJson);

  const tlds = [];
  for (const tld of WAVE) {
    const page = parseRootZonePage(await text(`https://www.iana.org/domains/root/db/${tld}.html`));
    await sleep(DELAY_MS);
    const rdapServer = rdapServerFor(`example.${tld}`, bootstrap);
    const result = await test(tld, rdapServer !== null);
    console.log(
      tld.padEnd(5),
      (page.category ?? "?").padEnd(32),
      result.result,
      "domain" in result ? (result.domain ?? "") : "",
    );
    tlds.push({ tld, ...page, rdapServer, test: result });
  }
  writeFileSync(
    "content/tld-data.json",
    `${JSON.stringify({ checkedAt, bootstrapPublication: bootstrapJson.publication ?? null, tlds }, null, 2)}\n`,
  );
  execFileSync("npx", ["prettier", "--write", "content/rdap-bootstrap.json", "content/tld-data.json"], {
    stdio: "ignore",
  });
  console.log(`wrote ${tlds.length} TLDs to content/tld-data.json`);
}

if (process.argv[1]?.endsWith("refresh-tld-data.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
