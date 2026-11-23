import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHead } from "@/components/landing";
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
import { clientStatusPricing } from "@/content/client-status";
import { compareSeo } from "@/content/competitor-pages";
import { COMPETITORS, compareSlug, competitorForCompareSlug, siblings } from "@/content/competitors";
import { monthsFreeYearly, PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";

// Every page is prerendered from generateStaticParams, so navigations get full static HTML. Blocking
// on params is intended: a Suspense boundary would turn unknown slugs into soft 404s (status 200).
export const instant = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: compareSlug(c) }));
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const c = competitorForCompareSlug((await params).slug);
  return c ? pageMetadata(compareSeo(c)) : {};
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <h3 className="m-0 text-[18px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export default async function ComparePage({ params }: PageProps<"/compare/[slug]">) {
  const c = competitorForCompareSlug((await params).slug);
  if (!c) notFound();
  const path = `/compare/${compareSlug(c)}`;
  const trial = PLANS[TRIAL_PLAN];

  return (
    <>
      <PageHero
        crumbs={[
          { name: "Compare", path: "/compare" },
          { name: `Client Status vs ${c.name}`, path },
        ]}
        kicker="Comparison"
        title={`Client Status vs ${c.name}`}
        actions={
          <ButtonLink href="/sign-up" size="lg">
            Start {TRIAL_DAYS}-day free trial
          </ButtonLink>
        }
      >
        <dl className="m-0 grid gap-3 text-[15px] leading-relaxed text-ink-2 tbl:grid-cols-2 tbl:gap-8">
          <div className="flex flex-col gap-1">
            <dt className="font-semibold text-ink">{c.name}</dt>
            <dd className="m-0">{c.summary}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-semibold text-ink">Client Status</dt>
            <dd className="m-0">
              Website monitoring for agencies (uptime, SSL, domains and weekly audits) with a branded monthly report for
              every client.
            </dd>
          </div>
        </dl>
        <AsOf c={c} />
      </PageHero>

      <Band>
        <SectionHead kicker="Short answer" title="Which one fits your agency" />
        <div className="grid gap-8 tbl:grid-cols-2">
          <Side title={`Choose ${c.name} if…`}>
            <Bullets items={c.chooseThemIf} />
          </Side>
          <Side title="Choose Client Status if…">
            <Bullets items={c.chooseUsIf} />
          </Side>
        </div>
      </Band>

      <Band tinted>
        <SectionHead
          kicker="In detail"
          title="Feature by feature"
          intro="What each tool does for each check, with the limits that matter when you look after many client sites."
        />
        <ComparisonTable
          caption={`Detailed feature comparison of Client Status and ${c.name}`}
          columns={["Client Status", c.name]}
          rows={featureRows(c, true)}
        />
        <TableFootnote c={c} />
      </Band>

      <Band>
        <SectionHead kicker="Pricing" title="What it costs" />
        <div className="grid gap-8 tbl:grid-cols-2">
          <Side title={c.name}>
            <p className="m-0 text-[15px] leading-relaxed text-ink-2">{c.pricingSummary}</p>
            <p className="m-0 text-[12.5px] text-muted">As listed in {formatMonth(c.verifiedAt)}.</p>
          </Side>
          <Side title="Client Status">
            <p className="m-0 text-[15px] leading-relaxed text-ink-2">
              {clientStatusPricing()}, in US dollars. Yearly billing gives {monthsFreeYearly(trial)} months free. Every
              plan includes uptime, SSL, domain and audit checks and monthly client reports. {TRIAL_DAYS}-day trial with{" "}
              {trial.name} features, no card.
            </p>
            <p className="m-0 text-[12.5px] text-muted">
              <Link href="/#pricing">Full plan details</Link>
            </p>
          </Side>
        </div>
      </Band>

      <Band tinted>
        <SectionHead kicker="Keep reading" title="Related pages" />
        <CompetitorLinks
          items={[
            {
              href: `/alternatives/${c.slug}`,
              label: `${c.name} alternative for agencies`,
              text: `Why agencies look beyond ${c.name}, and where it’s still the better pick.`,
            },
            ...siblings(c)
              .slice(0, 3)
              .map((o) => ({
                href: `/compare/${compareSlug(o)}`,
                label: `Client Status vs ${o.name}`,
                text: o.summary,
              })),
          ]}
        />
        <Sources c={c} />
      </Band>

      <CtaBand />
      <ClientStatusJsonLd />
    </>
  );
}
