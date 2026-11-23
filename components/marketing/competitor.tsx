import Link from "next/link";
import { CLIENT_STATUS_FEATURES, CLIENT_STATUS_NOTES } from "@/content/client-status";
import { type Competitor, FEATURE_KEYS, FEATURE_LABELS } from "@/content/competitors";
import type { ComparisonRow } from "@/components/marketing/comparison-table";
import { JsonLd } from "@/components/marketing/json-ld";
import { formatMonth } from "@/components/marketing/updated-at";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

// Building blocks shared by /alternatives and /compare. Page sections live in sections.tsx.

/** "Information as of November 2026" */
export function AsOf({ c }: { c: Pick<Competitor, "name" | "verifiedAt"> }) {
  return (
    <p className="m-0 text-[12.5px] text-muted">
      Information about {c.name} as of <time dateTime={c.verifiedAt}>{formatMonth(c.verifiedAt)}</time>, from its own
      website. <a href="#sources">Sources</a>
    </p>
  );
}

/** Feature rows: Client Status first, then the competitor. Notes only on the detailed /compare table. */
export function featureRows(c: Competitor, withNotes: boolean): ComparisonRow[] {
  return FEATURE_KEYS.map((k) => ({
    label: FEATURE_LABELS[k],
    values: [CLIENT_STATUS_FEATURES[k], c.features[k]],
    notes: withNotes ? [CLIENT_STATUS_NOTES[k], c.featureNotes[k]] : undefined,
  }));
}

export function TableFootnote({ c, compareHref }: { c: Competitor; compareHref?: string }) {
  return (
    <p className="m-0 max-w-[760px] text-[12.5px] leading-relaxed text-muted">
      “No” means we didn’t find the feature on {c.name}’s pricing, feature or documentation pages as of{" "}
      {formatMonth(c.verifiedAt)}. “Partial” means it exists with limits
      {compareHref ? (
        <>
          , explained in the <Link href={compareHref}>full comparison</Link>
        </>
      ) : (
        ", described under each value"
      )}
      .
    </p>
  );
}

export function Sources({ c }: { c: Competitor }) {
  return (
    <div id="sources" className="flex scroll-mt-20 flex-col gap-2 text-[13px]">
      <h2 className="m-0 text-[15px] font-semibold">Sources</h2>
      <p className="m-0 text-muted">
        {c.name} details were read from these pages on <time dateTime={c.verifiedAt}>{formatMonth(c.verifiedAt)}</time>.
        Prices and features change; check them before you decide.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {c.sources.map((u) => (
          <li key={u}>
            <a href={u} rel="nofollow noopener" target="_blank" className="break-all">
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Client Status as a SoftwareApplication, with prices from lib/plans.ts and no ratings. */
export function ClientStatusJsonLd() {
  const prices = PLAN_ORDER.map((k) => PLANS[k].priceUsdMonthly);
  return (
    <JsonLd
      data={{
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: absoluteUrl("/"),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "Website monitoring and white-label monthly client reports for web and maintenance agencies.",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
        },
      }}
    />
  );
}

/** Small list of links to other competitor pages. */
export function CompetitorLinks({ items }: { items: { href: string; label: string; text?: string }[] }) {
  return (
    <ul className="m-0 grid list-none gap-x-8 gap-y-3 p-0 text-[14px] tbl:grid-cols-2">
      {items.map((i) => (
        <li key={i.href} className="flex flex-col gap-0.5">
          <Link href={i.href} className="font-semibold">
            {i.label}
          </Link>
          {i.text ? <span className="text-[13px] leading-snug text-muted">{i.text}</span> : null}
        </li>
      ))}
    </ul>
  );
}
