import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { Band, PageHero } from "@/components/marketing/sections";
import { CtaBand } from "@/components/marketing/cta-band";
import { formatMonth } from "@/components/marketing/updated-at";
import { COMPARE_HUB } from "@/content/competitor-pages";
import { activeCategories, CATEGORY_LABELS, compareSlug, competitorsIn, latestVerifiedAt } from "@/content/competitors";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(COMPARE_HUB);

export default function CompareHub() {
  return (
    <>
      <PageHero crumbs={[{ name: "Compare", path: "/compare" }]} kicker="Compare" title="Client Status vs other tools">
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          Head-to-head comparisons with the tools agencies use most for client websites: what each one checks, what your
          clients receive, and what it costs. Each comparison says when the other tool is the better pick.
        </p>
        <p className="m-0 text-[12.5px] text-muted">
          Vendor facts checked in {formatMonth(latestVerifiedAt())}, from their own websites. Looking for a broader
          overview? See <Link href="/alternatives">alternatives by category</Link>.
        </p>
      </PageHero>

      {activeCategories().map((cat, i) => (
        <Band key={cat} tinted={i % 2 === 1}>
          <SectionHead kicker="Compare" title={CATEGORY_LABELS[cat].title} />
          <CompetitorLinks
            items={competitorsIn(cat).map((c) => ({
              href: `/compare/${compareSlug(c)}`,
              label: `Client Status vs ${c.name}`,
              text: c.summary,
            }))}
          />
        </Band>
      ))}

      <CtaBand />
    </>
  );
}
