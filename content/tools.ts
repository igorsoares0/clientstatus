import { SSL_THRESHOLD_DAYS } from "@/lib/monitoring/tls-check";
import { ALERT_EVENTS } from "@/lib/notify/settings";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { TOOL_SEO, TOOLS_UPDATED } from "@/content/tool-seo";
import type { PageSeo } from "@/lib/seo";
import { TOOL_CRAWL_LIMITS } from "@/lib/tools/crawl-limits";
import type { ToolSlug } from "@/lib/tools/limits";

// Copy for /tools (docs/pseo-plan.md §4.1). Each tool page carries real explanation below the
// form: what's checked, how to read the result, common causes and how to monitor it for good.
// Every product claim here is read from, or matches, the code that does the work.

export type ToolSection = { title: string; paragraphs?: string[]; bullets?: string[] };

export type ToolContent = {
  slug: ToolSlug;
  name: string;
  /** One line for the hub and cards. */
  summary: string;
  seo: PageSeo;
  heading: string;
  intro: string;
  sections: ToolSection[];
  faq: { q: string; a: string }[];
  /** ISO date the copy was last reviewed (sitemap lastModified). */
  updatedAt: string;
};

const UPDATED = TOOLS_UPDATED;
const thresholds = SSL_THRESHOLD_DAYS.join(", ").replace(/, (\d+)$/, " and $1");
const pages = PLAN_ORDER.map((k) => PLANS[k].maxPagesPerAudit.toLocaleString("en-US"));
const pageRange = `${pages[0]} to ${pages.at(-1)}`;
const toolPages = TOOL_CRAWL_LIMITS.maxPages;

export const TOOLS: readonly ToolContent[] = [
  {
    slug: "ssl-checker",
    name: "SSL checker",
    summary: "Check a website’s SSL certificate: issuer, expiry date, days left and whether browsers will trust it.",
    seo: TOOL_SEO["ssl-checker"],
    heading: "SSL certificate checker",
    intro:
      "Enter a website to see the certificate visitors receive: who issued it, when it expires and whether browsers will trust it. One live check, nothing stored.",
    sections: [
      {
        title: "What this checks",
        paragraphs: [
          "We connect to the site on port 443 the way a browser does and read the certificate the server presents. We check that it covers the hostname you entered, that it chains to a trusted authority, and that today falls between its start and end dates.",
          "Sites behind a CDN such as Cloudflare present the CDN’s edge certificate, so that’s the one you’ll see here — it’s also the one your visitors get.",
        ],
      },
      {
        title: "How to read the result",
        bullets: [
          "Valid: the certificate is trusted, matches the hostname and has more than 30 days left.",
          "Renewal due: still valid, but it expires within 30 days. If renewal is automatic, check that it actually ran last time.",
          "Expired or problem: visitors see a full-page browser warning. Common problems are a hostname mismatch, a missing intermediate certificate or a self-signed certificate.",
          "Couldn’t check: the connection timed out or was refused. That says nothing about the certificate either way, so try again before acting on it.",
        ],
      },
      {
        title: "Why certificates lapse on client sites",
        bullets: [
          "Automatic renewal stopped after a DNS, hosting or CDN change, and nobody noticed until it expired.",
          "The certificate covers www but not the bare domain (or the other way round).",
          "The site moved to a new server and the old certificate came with it, or the intermediate chain was left out.",
          "A manually bought certificate renews once a year, and the reminder goes to someone who has left.",
        ],
      },
      {
        title: "Monitor it automatically",
        paragraphs: [
          `Client Status checks every client site’s certificate every 6 hours. It warns your team ${thresholds} days before expiry and alerts straight away if a certificate becomes invalid, expired or untrusted. Each client’s monthly report lists certificate dates under “Dates to know”.`,
        ],
      },
    ],
    faq: [
      {
        q: "How often should I check SSL certificates?",
        a: "Most certificates now renew every 90 days or less, so a yearly reminder isn’t enough. Check at least daily if you look after several sites; Client Status checks every 6 hours.",
      },
      {
        q: "Why does the result differ from my browser?",
        a: "Browsers cache certificates and may connect through a different CDN node. If the result surprises you, run the check again in a few minutes.",
      },
    ],
    updatedAt: UPDATED,
  },
  {
    slug: "domain-expiry-checker",
    name: "Domain expiry checker",
    summary: "Look up when a domain’s registration ends, straight from the registry’s RDAP service.",
    seo: TOOL_SEO["domain-expiry-checker"],
    heading: "Domain expiry checker",
    intro:
      "Enter a domain to see when its registration ends, read live from the registry. Where a registry doesn’t publish an expiry date, we say so instead of guessing.",
    sections: [
      {
        title: "What this checks",
        paragraphs: [
          "We find the registry’s RDAP server in IANA’s official list and ask it about the registered domain (for shop.example.com, that’s example.com). RDAP is the structured successor to WHOIS, so the date comes straight from the registry’s record, along with the registrar when it’s listed.",
        ],
      },
      {
        title: "How to read the result",
        bullets: [
          "Registered until: the registration is active until that date.",
          "Expiring soon: 30 days or fewer left. Check that auto-renew is on and the card on file is current.",
          "n/a: the registry doesn’t publish an expiry date over RDAP, or doesn’t offer RDAP at all. Several country-code registries work this way; check with the registrar instead.",
          "Couldn’t check: the registry didn’t answer or rate-limited the lookup. Try again in a minute.",
        ],
      },
      {
        title: "Why domains lapse",
        bullets: [
          "The card on file expired and the renewal failed quietly.",
          "Auto-renew was switched off during a transfer and never switched back on.",
          "The registrar account belongs to a former employee or the client’s old agency, so renewal notices go nowhere.",
          "The client registered the domain themselves years ago and forgot about it.",
        ],
      },
      {
        title: "Monitor it automatically",
        paragraphs: [
          `Client Status looks up every client domain daily over RDAP and warns your team ${ALERT_EVENTS.domain_expiry.rule.replace(" · only", ", only")}. When a registry doesn’t publish a date, the dashboard and the client report show “n/a”, never an estimate.`,
        ],
      },
    ],
    faq: [
      {
        q: "Why is there no expiry date for my domain?",
        a: "Some registries don’t run RDAP or leave the expiry date out of their public records. That’s a registry policy, not an error. Your registrar’s dashboard will show the date.",
      },
      {
        q: "What happens when a domain expires?",
        a: "Most registries suspend the domain first (the site and email stop working), then offer a grace and redemption period before it’s released. Restoring it during redemption usually costs extra.",
      },
    ],
    updatedAt: UPDATED,
  },
  {
    slug: "broken-link-checker",
    name: "Broken link checker",
    summary: `Crawl up to ${toolPages} pages of a site and list links that return errors, with the page each one is on.`,
    seo: TOOL_SEO["broken-link-checker"],
    heading: "Broken link checker",
    intro: `Enter a website and we’ll crawl up to ${toolPages} pages, check every link we find and list the broken ones with the page they’re on. It takes a minute or two.`,
    sections: [
      {
        title: "What this checks",
        paragraphs: [
          `Starting from the address you enter, we follow links on the same site up to ${TOOL_CRAWL_LIMITS.maxDepth} clicks deep and ${toolPages} pages, then check every internal and external link found on them. We follow robots.txt, pace our requests and identify ourselves as ClientStatusBot.`,
          "A link that fails is checked again before it’s reported, so a single slow response doesn’t show up as broken. Along the way we also note pages without a title, meta description, main heading or canonical tag.",
        ],
      },
      {
        title: "How to read the result",
        bullets: [
          "Broken: the link returned 404, 410 or another error, twice. On your own site, server errors (5xx) count too.",
          "Not counted as broken: links that answer with a bot challenge, a rate limit (429) or access restricted (401/403), and server errors on other people’s sites. We can’t tell whether those work for a visitor, so we leave them out.",
          `Partial: the crawl hit the ${toolPages}-page or time limit before it finished. Links on the pages it didn’t reach weren’t checked.`,
        ],
      },
      {
        title: "Where broken links come from",
        bullets: [
          "Pages were deleted or renamed without a redirect.",
          "A typo in a hand-written link, or a link copied from a staging site.",
          "Another site reorganised its pages and your outbound links now point at nothing.",
          "Menus and footers repeat one broken link across every page, so fixing it once fixes dozens.",
        ],
      },
      {
        title: "Monitor it automatically",
        paragraphs: [
          `Client Status audits every client site weekly, ${pageRange} pages depending on your plan, and lists broken links, redirect loops and missing titles, descriptions, headings and canonical tags. Findings go into each client’s monthly report with when they were first found.`,
        ],
      },
    ],
    faq: [
      {
        q: "Why didn’t it check every page on my site?",
        a: `This free check stops at ${toolPages} pages and ${TOOL_CRAWL_LIMITS.maxDepth} levels deep, follows robots.txt and doesn’t run JavaScript, so pages only reachable through scripts or forms aren’t found.`,
      },
      {
        q: "Do broken links hurt SEO?",
        a: "A few broken links won’t sink a site, but they waste visitors’ clicks and crawlers’ time. Broken internal links also stop pages from passing visitors and search engines on to the rest of the site.",
      },
    ],
    updatedAt: UPDATED,
  },
  {
    slug: "website-health-report",
    name: "Website health report",
    summary: "Get a sample client report for any website by email: uptime, SSL, domain and a quick audit, as a PDF.",
    seo: TOOL_SEO["website-health-report"],
    heading: "Free website health report",
    intro:
      "Enter a client’s website and your email. We check it once and email you a sample of the report Client Status sends clients every month, as a PDF.",
    sections: [
      {
        title: "What’s in the report",
        bullets: [
          "Availability: whether the site answered our check, and how fast.",
          "Security certificate and domain: expiry dates and anything a visitor would notice.",
          `A quick audit of up to ${toolPages} pages: broken links and missing titles, descriptions, headings and canonical tags, sorted into fix, improve and advisory.`,
          "A plain-language summary and the dates to know, in the same layout your clients would get.",
        ],
      },
      {
        title: "A sample, clearly labelled",
        paragraphs: [
          "It’s built from one check, not a month of monitoring, and it says so on the cover and in the data notes. A single failed check is never shown as an outage: Client Status only counts downtime after two failed checks in a row. The branding is a placeholder for your agency’s logo and colour.",
        ],
      },
      {
        title: "Use it with a prospect",
        paragraphs: [
          "Run it on a prospect’s website before a call: it shows what you’d keep an eye on and what you’d send them each month, using their own site.",
        ],
      },
      {
        title: "Get one for every client, every month",
        paragraphs: [
          "With Client Status, each client’s report is built from every check in the month, with your branding, and held for your review before it goes out on the 1st.",
        ],
      },
    ],
    faq: [
      {
        q: "What do you do with my email address?",
        a: "We send the report to it once and keep it, with the website address, for 12 months so we can answer questions about the report. We only send product updates if you tick that box. The Privacy Policy has the details.",
      },
      {
        q: "How long does it take?",
        a: "Usually a few minutes: the audit is paced so we don’t overload the site. If several reports are queued it can take longer.",
      },
    ],
    updatedAt: UPDATED,
  },
];

export function getTool(slug: ToolSlug): ToolContent {
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}
