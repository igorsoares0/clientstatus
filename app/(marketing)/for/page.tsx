import type { Metadata } from "next";
import { SectionHead } from "@/components/landing";
import { CompetitorLinks } from "@/components/marketing/competitor";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { PLATFORMS, PLATFORMS_HUB } from "@/content/platforms";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PLATFORMS_HUB);

export default function PlatformsHub() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Platforms", path: "/for" }]}
        kicker="Platforms"
        title="Website monitoring by platform"
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          Client Status works on any public website because it checks from the outside. But each platform breaks in its
          own ways — here’s what to watch for on each, what monitoring catches and what it can’t see.
        </p>
      </PageHero>
      <Band>
        <SectionHead kicker="Platforms" title="Pick your clients’ platform" />
        <CompetitorLinks items={PLATFORMS.map((p) => ({ href: p.seo.path, label: p.name, text: p.intro }))} />
      </Band>
      <CtaBand />
    </>
  );
}
