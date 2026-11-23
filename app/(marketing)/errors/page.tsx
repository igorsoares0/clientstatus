import type { Metadata } from "next";
import { SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { ERROR_GROUPS, ERRORS, ERRORS_HUB } from "@/content/errors";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(ERRORS_HUB);

export default function ErrorsHub() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Errors", path: "/errors" }]}
        kicker="Error glossary"
        title="Website errors, explained"
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          The errors clients forward as screenshots: what each one means, what usually causes it, how to fix it, and how
          Client Status classifies it. That last part comes from running the product’s own classification code, not from
          a description of it.
        </p>
      </PageHero>
      {ERROR_GROUPS.map((g, i) => (
        <Band key={g.id} tinted={i % 2 === 1}>
          <SectionHead
            kicker={`${ERRORS.filter((e) => e.group === g.id).length} errors`}
            title={g.title}
            intro={g.intro}
          />
          <CompetitorLinks
            items={ERRORS.filter((e) => e.group === g.id).map((e) => ({
              href: e.seo.path,
              label: e.code,
              text: e.name,
            }))}
          />
        </Band>
      ))}
      <CtaBand />
    </>
  );
}
