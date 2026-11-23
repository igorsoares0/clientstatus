import { z } from "zod";
import raw from "@/content/tld-data.json";
import type { PageSeo, SitemapPage } from "@/lib/seo";

// Data for /domain-expiry/[tld] (docs/pseo-plan.md §4.2). content/tld-data.json is written by
// scripts/refresh-tld-data.ts from IANA's root zone database and RDAP bootstrap, plus one real
// RDAP lookup per TLD. Nothing here is typed in by hand except the region and second-level names.
//
// Only TLDs whose registry is listed in IANA's RDAP bootstrap are indexed: their pages carry
// registry-specific facts (server, whether expiry dates are published, a tested lookup). TLDs
// without a listed server get a page (people search for them) but it's noindex, because those
// pages would differ only by name.

const testSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("published"), domain: z.string(), expiresAt: z.string() }),
  z.object({ result: z.literal("not-published"), domain: z.string(), domains: z.array(z.string()).min(2) }),
  z.object({ result: z.literal("no-rdap"), domain: z.null() }),
  z.object({ result: z.literal("failed"), domain: z.string().nullable(), detail: z.string() }),
]);

const fileSchema = z.object({
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bootstrapPublication: z.string().nullable(),
  tlds: z.array(
    z.object({
      tld: z.string().regex(/^[a-z]{2,63}$/),
      category: z.string().nullable(),
      manager: z.string().nullable(),
      rdapServer: z.url().nullable(),
      test: testSchema,
    }),
  ),
});

const data = fileSchema.parse(raw);

export const TLD_CHECKED_AT = data.checkedAt;

export type TldKind = "generic" | "country-code" | "other";
export type Region = "Europe" | "Americas" | "Asia-Pacific";

/** Country-code TLDs by region, for "neighbouring TLD" links. */
const REGION: Record<string, Region> = {
  uk: "Europe",
  ie: "Europe",
  de: "Europe",
  fr: "Europe",
  nl: "Europe",
  be: "Europe",
  es: "Europe",
  it: "Europe",
  eu: "Europe",
  ch: "Europe",
  at: "Europe",
  se: "Europe",
  pl: "Europe",
  me: "Europe",
  us: "Americas",
  ca: "Americas",
  br: "Americas",
  co: "Americas",
  ai: "Americas",
  au: "Asia-Pacific",
  nz: "Asia-Pacific",
  in: "Asia-Pacific",
  tv: "Asia-Pacific",
};

/** Common second-level names registered under a country code; looked up on the TLD's server. */
const SECOND_LEVEL: Record<string, string[]> = {
  uk: ["co.uk", "org.uk", "me.uk"],
  br: ["com.br", "net.br", "org.br"],
  au: ["com.au", "net.au", "org.au"],
  nz: ["co.nz", "org.nz"],
  in: ["co.in", "net.in"],
};

export type Tld = (typeof data.tlds)[number] & {
  kind: TldKind;
  region: Region | null;
  secondLevel: string[];
};

export const TLDS: readonly Tld[] = data.tlds.map((t) => ({
  ...t,
  kind: t.category?.startsWith("Generic")
    ? "generic"
    : t.category?.startsWith("Country-code")
      ? "country-code"
      : "other",
  region: REGION[t.tld] ?? null,
  secondLevel: SECOND_LEVEL[t.tld] ?? [],
}));

export function getTld(tld: string): Tld | undefined {
  return TLDS.find((t) => t.tld === tld);
}

/** Indexed only with registry-specific data: a listed RDAP server and a lookup that answered. */
export function isIndexable(t: Tld): boolean {
  return t.rdapServer !== null && (t.test.result === "published" || t.test.result === "not-published");
}

/** Same kind (and, for country codes, the same region) first, then the rest of that kind. */
export function neighbours(t: Tld, max = 6): Tld[] {
  const same = TLDS.filter((o) => o.tld !== t.tld && o.kind === t.kind);
  const near = t.region ? same.filter((o) => o.region === t.region) : same;
  const rest = same.filter((o) => !near.includes(o));
  return [...near, ...rest].slice(0, max);
}

export function tldPath(t: Pick<Tld, "tld">): string {
  return `/domain-expiry/${t.tld}`;
}

const DESCRIPTION: Record<Tld["test"]["result"], (t: Tld) => string> = {
  published: (t) =>
    `Check when a .${t.tld} domain expires. The .${t.tld} registry publishes expiry dates over RDAP; look one up free and see how agencies get warned before renewal.`,
  "not-published": (t) =>
    `Check a .${t.tld} domain’s registration. The .${t.tld} registry answers RDAP but doesn’t publish expiry dates; here’s what that means and where to find the date.`,
  "no-rdap": (t) =>
    `Why .${t.tld} domain expiry dates can’t be looked up over RDAP: IANA lists no RDAP server for .${t.tld}. What agencies can check instead, for free.`,
  failed: (t) =>
    `Look up a .${t.tld} domain’s expiry date over RDAP, free, and see how agencies monitor domain renewals.`,
};

export function tldSeo(t: Tld): PageSeo {
  return { title: `.${t.tld} domain expiry checker`, description: DESCRIPTION[t.test.result](t), path: tldPath(t) };
}

export const DOMAIN_EXPIRY_HUB: PageSeo = {
  title: "Domain expiry lookup by TLD",
  description:
    "Which top-level domains publish expiry dates over RDAP, who runs each registry, and a free lookup for any domain. Data from IANA, tested against each registry.",
  path: "/domain-expiry",
};

export function domainExpiryPages(): SitemapPage[] {
  return [
    { path: DOMAIN_EXPIRY_HUB.path, lastModified: TLD_CHECKED_AT },
    ...TLDS.filter(isIndexable).map((t) => ({ path: tldPath(t), lastModified: TLD_CHECKED_AT })),
  ];
}
