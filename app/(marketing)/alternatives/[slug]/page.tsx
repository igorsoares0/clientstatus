import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Faq, PricingTable, SectionHead } from "@/components/landing";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import {
  AsOf,
  ClientStatusJsonLd,
  CompetitorLinks,
  featureRows,
  Sources,
  TableFootnote,
} from "@/components/marketing/competitor";
import { Band, Bullets, PageHero } from "@/components/marketing/sections";
import { CtaBand } from "@/components/marketing/cta-band";
import { formatMonth } from "@/components/marketing/updated-at";
import { ButtonLink } from "@/components/ui/button";
import { alternativeSeo } from "@/content/competitor-pages";
import { COMPETITORS, CATEGORY_LABELS, compareSlug, getCompetitor, siblings } from "@/content/competitors";
import { TRIAL_DAYS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { relatedLinks } from "@/lib/seo-links";

// Every page is prerendered from generateStaticParams, so navigations get full static HTML. Unknown
// slugs get their 404 status from proxy.ts (lib/marketing-slugs.ts): with Cache Components the page
// streams a 200 shell before notFound() runs, `instant = false` included; notFound() only renders it.
export const instant = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/alternatives/[slug]">): Promise<Metadata> {
  const c = getCompetitor((await params).slug);
  return c ? pageMetadata(alternativeSeo(c)) : {};
}

/** What every agency gets from Client Status, whichever tool they come from (landing page facts). */
const CLIENT_STATUS_ADDS = [
  "A report with your agency’s branding for every client on the 1st of the month: availability day by day, confirmed incidents, speed, certificates and domains, audit findings and what happens next.",
  "Clients don’t need an account. They get a PDF by email or a private link that you can revoke.",
  "Alerts only on confirmed failures: a site counts as down after two failed checks in a row, and alerts go to your team, never to clients.",
  "Inconclusive checks (timeouts, rate limits, bot challenges) are left out of uptime and shown as gaps, never quietly counted as up.",
];

export default async function AlternativePage({ params }: PageProps<"/alternatives/[slug]">) {
  const c = getCompetitor((await params).slug);
  if (!c) notFound();
  const compareHref = `/compare/${compareSlug(c)}`;
  const others = siblings(c);

  return (
    <>
      <PageHero
        crumbs={[
          { name: "Alternatives", path: "/alternatives" },
          { name: c.name, path: `/alternatives/${c.slug}` },
        ]}
        kicker={`${c.name} alternative`}
        title={`${c.name} alternative for agencies`}
        actions={
          <>
            <ButtonLink href="/sign-up" size="lg">
              Start {TRIAL_DAYS}-day free trial
            </ButtonLink>
            <ButtonLink href={compareHref} size="lg" variant="secondary">
              Full comparison
            </ButtonLink>
          </>
        }
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">{c.whoItsFor}</p>
        <AsOf c={c} />
      </PageHero>

      <Band>
        <SectionHead kicker="At a glance" title={`Client Status and ${c.name}, feature by feature`} />
        <ComparisonTable
          caption={`Features of Client Status and ${c.name}`}
          columns={["Client Status", c.name]}
          rows={featureRows(c, false)}
        />
        <TableFootnote c={c} compareHref={compareHref} />
      </Band>

      <Band tinted>
        <SectionHead kicker="Be fair" title={`Where ${c.name} is the better choice`} intro={c.bestFor} />
      </Band>

      <Band>
        <SectionHead kicker="Why agencies look elsewhere" title={`What ${c.name} leaves to you`} />
        <Bullets items={c.whyAgenciesSwitch} />
        <h3 className="m-0 mt-2 text-[18px] font-semibold">What Client Status adds for agencies</h3>
        <Bullets items={CLIENT_STATUS_ADDS} />
      </Band>

      <Band tinted>
        <SectionHead
          kicker="Pricing"
          title="Pricing side by side"
          intro={`${c.name}, as of ${formatMonth(c.verifiedAt)}: ${c.pricingSummary}`}
        />
        <PricingTable />
        {c.freePlan ? (
          <p className="m-0 text-[12.5px] text-muted">
            {c.name} has a free option; Client Status doesn’t, but every plan starts with a {TRIAL_DAYS}-day trial.
          </p>
        ) : null}
      </Band>

      {others.length > 0 ? (
        <Band>
          <SectionHead kicker="Also compared" title={`Other ${CATEGORY_LABELS[c.category].title.toLowerCase()}`} />
          <CompetitorLinks
            items={others.map((o) => ({
              href: `/alternatives/${o.slug}`,
              label: `${o.name} alternative`,
              text: o.summary,
            }))}
          />
        </Band>
      ) : null}

      <Band tinted={others.length > 0}>
        <SectionHead kicker="Related" title="Platforms, comparison and report templates" />
        <CompetitorLinks items={relatedLinks({ kind: "competitor", slug: c.slug })} />
      </Band>

      <Band tinted={others.length === 0}>
        <SectionHead kicker="Questions" title={`${c.name} and Client Status`} />
        <Faq items={c.faq} />
        <Sources c={c} />
      </Band>

      <CtaBand />
      <ClientStatusJsonLd />
    </>
  );
}
