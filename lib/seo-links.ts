import { compareSlug, getCompetitor, type Category } from "@/content/competitors";
import { ERRORS, getError } from "@/content/errors";
import { getPlatform, PLATFORMS } from "@/content/platforms";
import { getTemplate } from "@/content/templates";
import { TOOL_SEO } from "@/content/tool-seo";
import type { ToolSlug } from "@/lib/tools/limits";

// Internal links between marketing directories (docs/pseo-plan.md §7), as one pure function so
// every page links the same way and the rules are unit-tested (tests/unit/seo-links.test.ts).

export type PageRef = { kind: "competitor" | "platform" | "template" | "error"; slug: string };

export type RelatedLink = { href: string; label: string; text?: string };

const TEMPLATES_FOR: Record<Category, string[]> = {
  uptime: ["uptime-report-template", "monthly-website-report-for-clients"],
  "wp-management": ["website-maintenance-report-template", "website-care-plan-report"],
  "agency-reporting": ["monthly-website-report-for-clients", "website-care-plan-report"],
};

const TOOL_LABEL: Record<ToolSlug, string> = {
  "ssl-checker": "SSL checker",
  "domain-expiry-checker": "Domain expiry checker",
  "broken-link-checker": "Broken link checker",
  "website-health-report": "Website health report",
};

/** Errors worth a link from a platform page, at most this many. */
const PLATFORM_ERRORS = 3;

function errorLink(slug: string): RelatedLink | null {
  const e = getError(slug);
  return e ? { href: e.seo.path, label: e.code, text: e.name } : null;
}

function templateLink(slug: string): RelatedLink | null {
  const t = getTemplate(slug);
  return t ? { href: t.seo.path, label: t.heading, text: "Report template with a real sample" } : null;
}

export function toolLink(slug: ToolSlug): RelatedLink {
  return { href: TOOL_SEO[slug].path, label: TOOL_LABEL[slug], text: "Free tool" };
}

export function relatedLinks(page: PageRef): RelatedLink[] {
  const links: (RelatedLink | null)[] = [];
  switch (page.kind) {
    case "competitor": {
      const c = getCompetitor(page.slug);
      if (!c) return [];
      // Platform pages that mention this tool, its comparison, then two templates.
      for (const p of PLATFORMS.filter((p) => p.alternatives.includes(c.slug))) {
        links.push({
          href: p.seo.path,
          label: `Monitoring ${p.name} sites`,
          text: `How ${p.name} sites break and what to watch`,
        });
      }
      links.push({
        href: `/compare/${compareSlug(c)}`,
        label: `Client Status vs ${c.name}`,
        text: "Side-by-side comparison",
      });
      for (const slug of TEMPLATES_FOR[c.category]) links.push(templateLink(slug));
      break;
    }
    case "platform": {
      const p = getPlatform(page.slug);
      if (!p) return [];
      for (const slug of p.alternatives) {
        const c = getCompetitor(slug);
        if (c) links.push({ href: `/alternatives/${c.slug}`, label: `${c.name} alternative`, text: c.summary });
      }
      for (const slug of p.templates) links.push(templateLink(slug));
      for (const e of ERRORS.filter((e) => e.platforms.includes(p.slug)).slice(0, PLATFORM_ERRORS)) {
        links.push(errorLink(e.slug));
      }
      break;
    }
    case "template": {
      const t = getTemplate(page.slug);
      if (!t) return [];
      for (const slug of t.tools) links.push(toolLink(slug));
      for (const p of PLATFORMS.filter((p) => p.templates.includes(t.slug)).slice(0, 3)) {
        links.push({ href: p.seo.path, label: `Monitoring ${p.name} sites` });
      }
      break;
    }
    case "error": {
      // Its tool, then two related errors.
      const e = getError(page.slug);
      if (!e) return [];
      if (e.tool) links.push(toolLink(e.tool));
      for (const slug of e.related) links.push(errorLink(slug));
      break;
    }
  }
  const seen = new Set<string>();
  return links.filter((l): l is RelatedLink => !!l && !seen.has(l.href) && !!seen.add(l.href));
}
