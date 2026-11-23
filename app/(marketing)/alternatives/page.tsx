import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/landing";
import { ClientStatusJsonLd } from "@/components/marketing/competitor";
import { Band, PageHero } from "@/components/marketing/sections";
import { CtaBand } from "@/components/marketing/cta-band";
import { formatMonth } from "@/components/marketing/updated-at";
import { ButtonLink } from "@/components/ui/button";
import { ALTERNATIVES_HUB } from "@/content/competitor-pages";
import { activeCategories, CATEGORY_LABELS, compareSlug, competitorsIn, latestVerifiedAt } from "@/content/competitors";
import { TRIAL_DAYS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(ALTERNATIVES_HUB);

export default function AlternativesHub() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Alternatives", path: "/alternatives" }]}
        kicker="Alternatives"
        title="Alternatives for agencies that report to clients"
        actions={
          <>
            <ButtonLink href="/sign-up" size="lg">
              Start {TRIAL_DAYS}-day free trial
            </ButtonLink>
            <ButtonLink href="/compare" size="lg" variant="secondary">
              Side-by-side comparisons
            </ButtonLink>
          </>
        }
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          Most agencies piece together client care from an uptime monitor, a WordPress dashboard and a monthly report
          built by hand. Here is how those tools compare with Client Status, including where each one is the better
          choice.
        </p>
        <p className="m-0 text-[12.5px] text-muted">
          Facts come from each vendor’s own pricing and feature pages, checked in {formatMonth(latestVerifiedAt())}.
          Each page links its sources.
        </p>
      </PageHero>

      {activeCategories().map((cat, i) => (
        <Band key={cat} tinted={i % 2 === 1}>
          <SectionHead
            kicker={`${competitorsIn(cat).length} tools`}
            title={CATEGORY_LABELS[cat].title}
            intro={CATEGORY_LABELS[cat].intro}
          />
          <ul className="m-0 grid list-none border-t border-rule p-0">
            {competitorsIn(cat).map((c) => (
              <li
                key={c.slug}
                className="grid gap-2 border-b border-rule py-4 tbl:grid-cols-[minmax(0,1fr)_auto] tbl:items-baseline tbl:gap-8"
              >
                <div className="flex flex-col gap-1">
                  <Link href={`/alternatives/${c.slug}`} className="text-[16px] font-semibold">
                    {c.name} alternative
                  </Link>
                  <span className="text-[14px] leading-relaxed text-ink-2">{c.summary}</span>
                </div>
                <Link href={`/compare/${compareSlug(c)}`} className="text-[13px] whitespace-nowrap">
                  Client Status vs {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Band>
      ))}

      <Band tinted={activeCategories().length % 2 === 1}>
        <SectionHead
          kicker="What we compare"
          title="The checks and the client report"
          intro="Each page compares uptime, SSL and domain expiry alerts, broken-link checks, scheduled client reports, branding, whether clients need an account, and whether the tool works on any platform. “No” means we couldn’t find the feature on the vendor’s own pages; we never guess."
        />
      </Band>

      <CtaBand />
      <ClientStatusJsonLd />
    </>
  );
}
