import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Faq, SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, Bullets, PageHero } from "@/components/marketing/sections";
import { UpdatedAt } from "@/components/marketing/updated-at";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { getTemplate, REPORT_PAGES, SAMPLE_PDF, TEMPLATES } from "@/content/templates";
import { TRIAL_DAYS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { relatedLinks } from "@/lib/seo-links";

// Fully prerendered from content/templates.ts; unknown slugs are real 404s (see alternatives/[slug]).
export const instant = false;

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/templates/[slug]">): Promise<Metadata> {
  const t = getTemplate((await params).slug);
  return t ? pageMetadata({ ...t.seo, ogImage: REPORT_PAGES[t.pages[0]!].src }) : {};
}

function ReportImage({ page, priority = false }: { page: keyof typeof REPORT_PAGES; priority?: boolean }) {
  const img = REPORT_PAGES[page];
  return (
    <figure className="m-0 flex flex-col gap-2">
      <Image
        src={img.src}
        alt={img.alt}
        width={1588}
        height={2246}
        priority={priority}
        sizes="(min-width: 980px) 400px, 90vw"
        className="h-auto w-full border border-border bg-surface"
      />
      <figcaption className="text-[12.5px] text-muted">{img.label}</figcaption>
    </figure>
  );
}

function Labelled({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <p className="m-0 text-[15px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

export default async function TemplatePage({ params }: PageProps<"/templates/[slug]">) {
  const t = getTemplate((await params).slug);
  if (!t) notFound();
  const shown = new Set<string>();

  return (
    <>
      <PageHero
        crumbs={[
          { name: "Report templates", path: "/templates" },
          { name: t.heading, path: t.seo.path },
        ]}
        kicker="Report template"
        title={t.heading}
        actions={
          <>
            <a href={SAMPLE_PDF} download className={buttonClass("primary", "lg", "no-underline hover:text-inherit")}>
              Download the sample PDF
            </a>
            <ButtonLink href="/sign-up" size="lg" variant="secondary">
              Start {TRIAL_DAYS}-day free trial
            </ButtonLink>
          </>
        }
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">{t.intro}</p>
        <p className="m-0 text-[12.5px] text-muted">
          The sample is rendered by the same code that builds real Client Status reports, with a fictional agency,
          client and .example websites.
        </p>
      </PageHero>

      {t.sections.map((s, i) => {
        const showImage = !shown.has(s.page);
        shown.add(s.page);
        return (
          <Band key={s.heading} tinted={i % 2 === 1}>
            <div className={`grid gap-8 ${showImage ? "tbl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]" : ""}`}>
              <div className="flex flex-col gap-5">
                <SectionHead kicker={REPORT_PAGES[s.page].label} title={s.heading} />
                <Labelled label="What it shows">{s.shows}</Labelled>
                <Labelled label="What it means for the client">{s.means}</Labelled>
                <Labelled label="What to say">{s.say}</Labelled>
              </div>
              {showImage ? <ReportImage page={s.page} priority={i === 0} /> : null}
            </div>
          </Band>
        );
      })}

      <Band tinted={t.sections.length % 2 === 1}>
        <SectionHead kicker="Tips" title="Making it land with clients" />
        <Bullets items={t.tips} />
      </Band>

      <Band tinted={t.sections.length % 2 === 0}>
        <SectionHead kicker="Questions" title="Common questions" />
        <Faq items={t.faq} />
        <UpdatedAt date={t.updatedAt} />
      </Band>

      <Band tinted={t.sections.length % 2 === 1}>
        <SectionHead kicker="Related" title="Get the data for this report" />
        <CompetitorLinks items={relatedLinks({ kind: "template", slug: t.slug })} />
      </Band>

      <CtaBand title="Send this report to every client on the 1st." />
    </>
  );
}
