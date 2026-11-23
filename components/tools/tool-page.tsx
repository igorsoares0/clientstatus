import type { ReactNode } from "react";
import { Faq, SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/marketing/json-ld";
import { Band, Bullets, PageHero } from "@/components/marketing/sections";
import { UpdatedAt } from "@/components/marketing/updated-at";
import { TOOLS, type ToolContent } from "@/content/tools";
import { absoluteUrl } from "@/lib/seo";

// Layout of every /tools page: the tool itself at the top, then the explanation that makes the
// page worth reading on its own, then the other tools and a call to action.

export function toolJsonLd(t: ToolContent) {
  return {
    "@type": "WebApplication",
    name: t.heading,
    url: absoluteUrl(t.seo.path),
    description: t.seo.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "Client Status", url: absoluteUrl("/") },
  };
}

export function ToolPage({ tool, children, extra }: { tool: ToolContent; children: ReactNode; extra?: ReactNode }) {
  const others = TOOLS.filter((t) => t.slug !== tool.slug);
  return (
    <>
      <PageHero
        crumbs={[
          { name: "Free tools", path: "/tools" },
          { name: tool.name, path: tool.seo.path },
        ]}
        kicker="Free tool"
        title={tool.heading}
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">{tool.intro}</p>
      </PageHero>

      <Band>{children}</Band>

      {tool.sections.map((s, i) => (
        <Band key={s.title} tinted={i % 2 === 0}>
          <SectionHead kicker={String(i + 1).padStart(2, "0")} title={s.title} />
          {s.paragraphs?.map((p) => (
            <p key={p} className="m-0 max-w-[760px] text-[15.5px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
          {s.bullets ? <Bullets items={s.bullets} /> : null}
        </Band>
      ))}

      {extra}

      <Band tinted={tool.sections.length % 2 === 0}>
        <SectionHead kicker="Questions" title="Common questions" />
        <Faq items={tool.faq} />
        <UpdatedAt date={tool.updatedAt} />
      </Band>

      <Band tinted={tool.sections.length % 2 === 1}>
        <SectionHead kicker="More free tools" title="Other checks" />
        <CompetitorLinks items={others.map((t) => ({ href: t.seo.path, label: t.name, text: t.summary }))} />
      </Band>

      <CtaBand title="Check every client site, every day." />
      <JsonLd data={toolJsonLd(tool)} />
    </>
  );
}
