import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/landing";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { UpdatedAt } from "@/components/marketing/updated-at";
import { DomainChecker } from "@/components/tools/domain-checker";
import { TldTable } from "@/components/tools/tld-table";
import { DOMAIN_EXPIRY_HUB, TLD_CHECKED_AT, TLDS, tldPath } from "@/content/tlds";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(DOMAIN_EXPIRY_HUB);

const EXPIRY = {
  published: "Published",
  "not-published": "Not published",
  "no-rdap": "No RDAP server listed",
  failed: "Unknown",
};
const KIND = { generic: "Generic", "country-code": "Country code", other: "Other" };

export default function DomainExpiryHub() {
  const published = TLDS.filter((t) => t.test.result === "published").length;
  return (
    <>
      <PageHero
        crumbs={[{ name: "Domain expiry", path: "/domain-expiry" }]}
        kicker="Domain expiry"
        title="Domain expiry lookup by TLD"
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          Whether you can look up a domain’s expiry date depends on its registry. Of the {TLDS.length} top-level domains
          below, {published} publish expiry dates over RDAP. The rest either leave the date out or aren’t listed in
          IANA’s RDAP directory, so tools — Client Status included — can only show “n/a” for them.
        </p>
      </PageHero>
      <Band>
        <SectionHead kicker="Look up a domain" title="Check any domain now" />
        <DomainChecker />
      </Band>
      <Band tinted>
        <SectionHead
          kicker="By TLD"
          title="Which registries publish expiry dates"
          intro="Registry and type come from IANA’s root zone database. “Published” means a real RDAP lookup of a registered domain returned an expiry date."
        />
        <TldTable
          rows={TLDS.map((t) => ({
            tld: t.tld,
            kind: KIND[t.kind],
            manager: t.manager ?? "—",
            expiry: EXPIRY[t.test.result],
            href: tldPath(t),
          }))}
        />
        <UpdatedAt date={TLD_CHECKED_AT} label="Tested" />
        <p className="m-0 text-[12.5px] text-muted">
          More on how the lookup works: <Link href="/tools/domain-expiry-checker">domain expiry checker</Link>.
        </p>
      </Band>
      <CtaBand title="Never let a client’s domain lapse." />
    </>
  );
}
