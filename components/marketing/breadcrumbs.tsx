import Link from "next/link";
import { Fragment } from "react";
import { JsonLd } from "@/components/marketing/json-ld";
import { absoluteUrl } from "@/lib/seo";

export type Crumb = { name: string; path: string };

/** BreadcrumbList JSON-LD with absolute URLs. "Home" is added in front. */
export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** Trail from Home to the current page (the last item, not linked). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const trail = [{ name: "Home", path: "/" }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-muted">
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
          {trail.map((c, i) => (
            <Fragment key={c.path}>
              {i > 0 ? (
                <li aria-hidden="true" className="text-faint">
                  /
                </li>
              ) : null}
              <li>
                {i === trail.length - 1 ? (
                  <span aria-current="page" className="text-ink-2">
                    {c.name}
                  </span>
                ) : (
                  <Link href={c.path} className="text-muted no-underline hover:text-ink hover:underline">
                    {c.name}
                  </Link>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  );
}
