import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/landing";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, PageHero } from "@/components/marketing/sections";
import { TOOLS_HUB } from "@/content/tool-seo";
import { TOOLS } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(TOOLS_HUB);

export default function ToolsHub() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Free tools", path: "/tools" }]}
        kicker="Free tools"
        title="Free website tools for agencies"
      >
        <p className="m-0 text-[16px] leading-relaxed text-ink-2">
          The same checks Client Status runs on every client site, one at a time and free. No account needed; nothing
          you check is published.
        </p>
      </PageHero>
      <Band>
        <SectionHead kicker="Tools" title="Check a site now" />
        <ul className="m-0 grid list-none border-t border-rule p-0">
          {TOOLS.map((t) => (
            <li key={t.slug} className="flex flex-col gap-1 border-b border-rule py-4">
              <Link href={t.seo.path} className="text-[16px] font-semibold">
                {t.heading}
              </Link>
              <span className="text-[14px] leading-relaxed text-ink-2">{t.summary}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px] text-muted">
          Looking up a domain’s registry? See <Link href="/domain-expiry">domain expiry by TLD</Link>.
        </p>
      </Band>
      <CtaBand title="Check every client site, every day." />
    </>
  );
}
