import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { formatDay } from "@/components/marketing/updated-at";
import { DomainChecker } from "@/components/tools/domain-checker";
import { getTld, isIndexable, neighbours, type Tld, TLD_CHECKED_AT, TLDS, tldPath, tldSeo } from "@/content/tlds";
import { ALERT_EVENTS } from "@/lib/notify/settings";
import { pageMetadata } from "@/lib/seo";

// Fully prerendered from content/tld-data.json; unknown TLDs are real 404s (see alternatives/[slug]).
export const instant = false;

export function generateStaticParams() {
  return TLDS.map((t) => ({ tld: t.tld }));
}

export async function generateMetadata({ params }: PageProps<"/domain-expiry/[tld]">): Promise<Metadata> {
  const t = getTld((await params).tld);
  return t ? pageMetadata({ ...tldSeo(t), noindex: !isIndexable(t) }) : {};
}

const WARN_RULE = ALERT_EVENTS.domain_expiry.rule.split(" · ")[0];

function expiryFact(t: Tld): string {
  const tested = `on ${formatDay(TLD_CHECKED_AT)}`;
  switch (t.test.result) {
    case "published":
      return `Yes. Our lookup of ${t.test.domain} ${tested} returned an expiry date (${formatDay(t.test.expiresAt)}).`;
    case "not-published":
      return `No. Our lookups of ${t.test.domains.join(", ")} ${tested} all returned registrations without an expiry date.`;
    case "no-rdap":
      return "Can’t be looked up over RDAP: IANA lists no RDAP server for this TLD.";
    case "failed":
      return "Unknown: our test lookup didn’t get an answer.";
  }
}

function Meaning({ t }: { t: Tld }) {
  const registry = t.manager ?? `the .${t.tld} registry`;
  const p = "m-0 max-w-[760px] text-[15.5px] leading-relaxed text-ink-2";
  switch (t.test.result) {
    case "published":
      return (
        <>
          <p className={p}>
            The expiry date of every .{t.tld} domain can be read straight from {registry}’s RDAP server, so a monitor
            can warn you well before renewal instead of finding out when the site and email stop working.
          </p>
          <p className={p}>
            Client Status looks up each client’s .{t.tld} domain daily and warns your team {WARN_RULE}. The date also
            appears in the client’s monthly report under “Dates to know”.
          </p>
        </>
      );
    case "not-published":
      return (
        <>
          <p className={p}>
            {registry}’s RDAP server answers lookups for .{t.tld} domains, but its public records leave the expiry date
            out. That’s a registry policy, not an error, and every RDAP tool will see the same thing.
          </p>
          <p className={p}>
            For .{t.tld} domains, keep the renewal date from the registrar account where the domain is managed, and
            check that auto-renew is on. Client Status shows “n/a” for the date rather than guessing, and still monitors
            the site’s uptime and SSL certificate.
          </p>
        </>
      );
    case "no-rdap":
    case "failed":
      return (
        <>
          <p className={p}>
            RDAP tools find each registry’s server in a directory published by IANA. That directory has no entry for .
            {t.tld}, so .{t.tld} expiry dates can’t be looked up the standard way, by Client Status or anyone else.
            {registry} may offer a lookup on its own website.
          </p>
          <p className={p}>
            Keep .{t.tld} renewal dates from the registrar account instead. Client Status shows “n/a” for these domains
            and still monitors uptime and the SSL certificate.
          </p>
        </>
      );
  }
}

export default async function TldPage({ params }: PageProps<"/domain-expiry/[tld]">) {
  const t = getTld((await params).tld);
  if (!t) notFound();
  const example = `example.${t.secondLevel[0] ?? t.tld}`;
  const facts: [string, string][] = [
    ["Type", t.category ?? "—"],
    ["Registry", t.manager ?? "—"],
    ["RDAP server", t.rdapServer ?? "None listed by IANA"],
    ["Expiry dates published", expiryFact(t)],
    ...(t.secondLevel.length
      ? [
          ["Also covers", t.secondLevel.map((s) => `.${s}`).join(", ") + " (looked up on the same server)"] as [
            string,
            string,
          ],
        ]
      : []),
  ];

  return (
    <>
      <PageHero
        crumbs={[
          { name: "Domain expiry", path: "/domain-expiry" },
          { name: `.${t.tld}`, path: tldPath(t) },
        ]}
        kicker={`.${t.tld} domains`}
        title={`Check when a .${t.tld} domain expires`}
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">{tldSeo(t).description}</p>
      </PageHero>

      <Band>
        <DomainChecker placeholder={example} />
      </Band>

      <Band tinted>
        <SectionHead kicker="Registry facts" title={`.${t.tld} at a glance`} />
        <dl className="m-0 grid max-w-[860px] gap-x-6 gap-y-3 border-t border-rule pt-4 text-[14.5px] tbl:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[12.5px] text-muted">
          Type and registry from IANA’s root zone database; RDAP server from IANA’s RDAP bootstrap; tested{" "}
          {formatDay(TLD_CHECKED_AT)}.
        </p>
      </Band>

      <Band>
        <SectionHead kicker="What it means" title={`Keeping .${t.tld} domains renewed`} />
        <Meaning t={t} />
        <p className="m-0 text-[13px] text-muted">
          How lookups work and why domains lapse: <Link href="/tools/domain-expiry-checker">domain expiry checker</Link>
          .
        </p>
      </Band>

      <Band tinted>
        <SectionHead kicker="Other TLDs" title="Compare with similar domains" />
        <CompetitorLinks
          items={neighbours(t).map((o) => ({
            href: tldPath(o),
            label: `.${o.tld}`,
            text:
              o.test.result === "published"
                ? "Expiry dates published over RDAP"
                : o.test.result === "not-published"
                  ? "RDAP server, but no expiry dates"
                  : "No RDAP server listed",
          }))}
        />
        <p className="m-0 text-[13px]">
          <Link href="/domain-expiry">All TLDs</Link>
        </p>
      </Band>

      <CtaBand title="Never let a client’s domain lapse." />
    </>
  );
}
