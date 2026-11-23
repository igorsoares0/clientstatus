import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, Bullets, PageHero } from "@/components/marketing/sections";
import { formatMonth } from "@/components/marketing/updated-at";
import { ButtonLink } from "@/components/ui/button";
import { getPlatform, PLATFORMS } from "@/content/platforms";
import { TRIAL_DAYS } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { relatedLinks } from "@/lib/seo-links";

// Fully prerendered from content/platforms.ts; unknown platforms are real 404s (see alternatives/[slug]).
export const instant = false;

export function generateStaticParams() {
  return PLATFORMS.map((p) => ({ platform: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/for/[platform]">): Promise<Metadata> {
  const p = getPlatform((await params).platform);
  return p ? pageMetadata(p.seo) : {};
}

export default async function PlatformPage({ params }: PageProps<"/for/[platform]">) {
  const p = getPlatform((await params).platform);
  if (!p) notFound();

  return (
    <>
      <PageHero
        crumbs={[
          { name: "Platforms", path: "/for" },
          { name: p.name, path: p.seo.path },
        ]}
        kicker={`For ${p.name}`}
        title={p.heading}
        actions={
          <ButtonLink href="/sign-up" size="lg">
            Start {TRIAL_DAYS}-day free trial
          </ButtonLink>
        }
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">{p.intro}</p>
        <p className="m-0 text-[12.5px] text-muted">
          {p.name} details from its own documentation, as of{" "}
          <time dateTime={p.verifiedAt}>{formatMonth(p.verifiedAt)}</time>. <a href="#sources">Sources</a>
        </p>
      </PageHero>

      <Band>
        <SectionHead kicker="Where it breaks" title={`How ${p.name} sites go wrong`} />
        <dl className="m-0 grid border-t border-rule tbl:grid-cols-2">
          {p.failures.map((f, i) => (
            <div
              key={f.title}
              className={`flex flex-col gap-1.5 border-b border-rule py-5 tbl:pr-8 ${i % 2 ? "tbl:border-l tbl:pl-8" : ""}`}
            >
              <dt className="text-[16px] font-semibold">{f.title}</dt>
              <dd className="m-0 text-[14.5px] leading-relaxed text-ink-2">{f.text}</dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band tinted>
        <SectionHead kicker="What it catches" title={`What Client Status catches on ${p.name}`} />
        <Bullets items={p.catches} />
      </Band>

      <Band>
        <SectionHead
          kicker="What it doesn’t"
          title="What it can’t see"
          intro="Client Status checks sites from the outside. It never logs into a CMS or runs updates."
        />
        <Bullets items={p.limits} />
      </Band>

      <Band tinted>
        <SectionHead
          kicker="Care plans"
          title={`Packaging care for ${p.name} clients`}
          intro="Suggestions from how agencies tend to work, not platform rules."
        />
        <Bullets items={p.packaging} />
      </Band>

      <Band>
        <SectionHead kicker="Related" title="Alternatives, templates and common errors" />
        <CompetitorLinks items={relatedLinks({ kind: "platform", slug: p.slug })} />
        <div id="sources" className="flex scroll-mt-20 flex-col gap-2 text-[13px]">
          <h2 className="m-0 text-[15px] font-semibold">Sources</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {p.sources.map((u) => (
              <li key={u}>
                <a href={u} rel="nofollow noopener" target="_blank" className="break-all">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
