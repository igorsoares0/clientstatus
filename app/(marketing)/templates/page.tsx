import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SectionHead } from "@/components/landing";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { REPORT_PAGES, SAMPLE_PDF, TEMPLATES, TEMPLATES_HUB } from "@/content/templates";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(TEMPLATES_HUB);

export default function TemplatesHub() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Report templates", path: "/templates" }]}
        kicker="Report templates"
        title="Client report templates for agencies"
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          One real sample report, explained for six different jobs: what each page shows, what it means for your client
          and what to say about it.{" "}
          <a href={SAMPLE_PDF} download>
            Download the sample PDF
          </a>
          .
        </p>
      </PageHero>
      <Band>
        <SectionHead kicker="Templates" title="Pick the report you need to send" />
        <ul className="m-0 grid list-none gap-6 p-0 tbl:grid-cols-3">
          {TEMPLATES.map((t) => {
            const img = REPORT_PAGES[t.pages[0]!];
            return (
              <li key={t.slug} className="flex flex-col gap-3">
                <Link href={t.seo.path} className="block no-underline">
                  <Image
                    src={img.src}
                    alt=""
                    width={1588}
                    height={2246}
                    sizes="(min-width: 720px) 30vw, 90vw"
                    className="h-auto w-full border border-border bg-surface"
                  />
                </Link>
                <Link href={t.seo.path} className="text-[16px] font-semibold">
                  {t.heading}
                </Link>
                <span className="text-[14px] leading-relaxed text-ink-2">{t.intro}</span>
              </li>
            );
          })}
        </ul>
      </Band>
      <CtaBand title="Send this report to every client on the 1st." />
    </>
  );
}
