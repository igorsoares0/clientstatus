import type { ToolSlug } from "@/lib/tools/limits";
import type { PageSeo, SitemapPage } from "@/lib/seo";

// /templates/[slug] (docs/pseo-plan.md §5.1). Every page shows the same real sample report
// (lib/reports/fixtures.ts, rendered by lib/reports/render.ts; images and PDF from
// `npm run landing:images`) but leads with different pages of it and explains them for a
// different job. The explanation is the value of the page. Claims match the product: the report
// fills "What happens next" itself and has no free-text notes, so commentary goes in your email.

export type ReportPage = "cover" | "availability" | "speed-security" | "audit" | "next-steps";

export const REPORT_PAGES: Record<ReportPage, { src: string; alt: string; label: string }> = {
  cover: {
    src: "/templates/report-cover.jpg",
    alt: "Report cover with a plain-language summary and the month at a glance",
    label: "Cover and summary",
  },
  availability: {
    src: "/templates/report-availability.jpg",
    alt: "Availability page with uptime per website, a day-by-day strip and confirmed incidents",
    label: "01 · Was the website available?",
  },
  "speed-security": {
    src: "/templates/report-speed-security.jpg",
    alt: "Speed and security page with response times, certificates and domain registration",
    label: "02 · Was it fast and secure?",
  },
  audit: {
    src: "/templates/report-audit.jpg",
    alt: "Audit page listing findings sorted into fix, improve and advisory",
    label: "03 · What did the latest audit find?",
  },
  "next-steps": {
    src: "/templates/report-next-steps.jpg",
    alt: "What happens next: open items, dates to know and notes about the report’s data",
    label: "04–05 · What happens next, and the data notes",
  },
};

export const SAMPLE_PDF = "/templates/sample-website-report.pdf";

export type TemplateSection = { page: ReportPage; heading: string; shows: string; means: string; say: string };

export type Template = {
  slug: string;
  seo: PageSeo;
  heading: string;
  /** Who it's for and the job it does, in one paragraph. */
  intro: string;
  /** Report pages shown, in order; the first is the lead image. */
  pages: ReportPage[];
  sections: TemplateSection[];
  tips: string[];
  faq: { q: string; a: string }[];
  tools: ToolSlug[];
  updatedAt: string;
};

const UPDATED = "2026-11-22";

const NEXT_STEPS_HONEST =
  "Client Status fills this page from what’s still open — unresolved incidents and audit items to fix — and the renewals due in the next 90 days. It doesn’t add free-text notes, so say what you’re doing about each item in the email you send with the report, or on your monthly call.";

export const TEMPLATES: readonly Template[] = [
  {
    slug: "website-maintenance-report-template",
    seo: {
      title: "Website maintenance report template",
      description:
        "A website maintenance report template for agencies: a real sample with uptime, incidents, speed, SSL, domains and audit findings, page by page, plus a PDF.",
      path: "/templates/website-maintenance-report-template",
    },
    heading: "Website maintenance report template",
    intro:
      "For agencies on a monthly maintenance retainer: a report that shows the client what was watched, what went wrong and what’s coming up, so the retainer doesn’t feel invisible in the months nothing breaks.",
    pages: ["cover", "availability", "speed-security", "audit", "next-steps"],
    sections: [
      {
        page: "cover",
        heading: "Start with a summary a busy client can read in ten seconds",
        shows:
          "Three or four sentences and four numbers: uptime, confirmed downtime, typical response time and items to fix.",
        means:
          "Most clients only read this page. If it says the site was up and nothing urgent is open, that’s the message they keep.",
        say: "Lead your covering email with the same headline. If something went wrong, name it here, not on page four.",
      },
      {
        page: "availability",
        heading: "Show availability day by day, not just a percentage",
        shows:
          "Uptime per website, the share of checks that ran, a strip with one cell per day, and each confirmed incident.",
        means:
          "“99.97%” is abstract; a red day on the strip with a 14-minute incident next to it is something a client understands.",
        say: "For each incident, say what caused it if you know and what changed afterwards. If you don’t know, say that too.",
      },
      {
        page: "speed-security",
        heading: "Cover the things that fail quietly",
        shows: "Typical and slowest response times by day, certificate expiry dates and domain registration dates.",
        means:
          "Certificates and domains rarely break, but when they do the whole site goes. This page shows they’re watched.",
        say: "If a renewal is due, say who renews it. Domains are often registered in the client’s own account.",
      },
      {
        page: "audit",
        heading: "Turn the audit into a short to-do list",
        shows:
          "Broken links and missing titles, descriptions, headings or canonical tags, sorted into fix, improve and advisory.",
        means: "“Fix” items affect visitors now; “improve” items affect how search engines list the site.",
        say: "Say which fixes are part of the retainer and which would be extra work, so the list doesn’t read as a bill.",
      },
      {
        page: "next-steps",
        heading: "End with what happens next",
        shows: "Open items with how long they’ve been open, the dates to know, and notes on any gaps in the data.",
        means: NEXT_STEPS_HONEST,
        say: "One line per open item is enough: what you’ll do and by when.",
      },
    ],
    tips: [
      "Send it on the same day every month. Clients notice when a report is late more than what’s in it.",
      "Keep the work you did (updates, content changes, backups) in your own covering email; the report covers what monitoring saw.",
      "When a month was quiet, say so in one sentence. A short report is good news.",
    ],
    faq: [
      {
        q: "Should a maintenance report list every plugin update?",
        a: "Only if your client cares. Most prefer outcomes (the site stayed up, nothing broke) over a changelog. Client Status reports what monitoring saw; list the work itself in your email if you want it on record.",
      },
      {
        q: "Can I use this template without Client Status?",
        a: "Yes. The sections work in any report. Client Status fills them in automatically from a month of checks and sends the PDF with your branding.",
      },
    ],
    tools: ["website-health-report", "broken-link-checker"],
    updatedAt: UPDATED,
  },
  {
    slug: "uptime-report-template",
    seo: {
      title: "Uptime report template for clients",
      description:
        "An uptime report template that clients understand: availability per site, day by day, confirmed incidents and how uptime was measured, with a sample PDF.",
      path: "/templates/uptime-report-template",
    },
    heading: "Uptime report template",
    intro:
      "For agencies that promise availability in a care plan or SLA: a monthly uptime report that shows the number, how it was measured and what happened on the bad days.",
    pages: ["availability", "next-steps", "cover"],
    sections: [
      {
        page: "availability",
        heading: "Report uptime per website, with coverage beside it",
        shows: "Uptime, last month’s figure, confirmed downtime, and how many of the expected checks actually ran.",
        means:
          "Coverage keeps the uptime honest: 100% from half the checks isn’t 100%. Checks that timed out or hit a bot wall are left out, not counted as up.",
        say: "If coverage dipped, explain why (the site was added mid-month, or checks were paused during a migration).",
      },
      {
        page: "availability",
        heading: "List confirmed incidents, not every blip",
        shows: "Each outage with its date, cause as monitoring saw it (for example HTTP 503) and duration.",
        means:
          "A site counts as down only after two failed checks in a row, so one dropped request never becomes an incident on a client’s report.",
        say: "Add the cause and the fix in your email: “the host restarted the server; we’ve asked them why”.",
      },
      {
        page: "next-steps",
        heading: "Say how it was measured",
        shows: "Check interval, the uptime formula, and any gaps in the month’s data.",
        means: "A client who forwards the report to a manager can answer “how do you know?” without asking you.",
        say: "If you promised an SLA, compare the figure with it here and in your email.",
      },
    ],
    tips: [
      "Don’t round 99.95% up to 100%. Clients trust the report more when the number isn’t perfect.",
      "Keep incidents in the client’s time zone; Client Status uses the workspace’s.",
      "If the client has several sites, report each one; an average hides the one that went down.",
    ],
    faq: [
      {
        q: "How is uptime calculated?",
        a: "Successful checks divided by completed, conclusive checks. Checks that didn’t run, timed out or met a bot challenge are left out of both numbers and disclosed as gaps.",
      },
      {
        q: "How often should uptime be checked?",
        a: "Every few minutes is enough for most client sites. Client Status checks every 1 to 5 minutes depending on the plan.",
      },
    ],
    tools: ["ssl-checker", "website-health-report"],
    updatedAt: UPDATED,
  },
  {
    slug: "website-care-plan-report",
    seo: {
      title: "Website care plan report template",
      description:
        "A care plan report clients actually read: a plain-language summary, open items and dates to know, built from a month of monitoring. Sample PDF included.",
      path: "/templates/website-care-plan-report",
    },
    heading: "Website care plan report",
    intro:
      "For agencies selling care plans to small businesses: a report that justifies the monthly fee to someone who isn’t technical, without drowning them in data.",
    pages: ["cover", "next-steps", "audit"],
    sections: [
      {
        page: "cover",
        heading: "Write for the owner, not the developer",
        shows:
          "A short summary in plain language: the site was up, a renewal is coming, the audit found four things to fix.",
        means: "Care plan clients pay for peace of mind. The cover should give it in one glance, or explain why not.",
        say: "Mirror the summary in your email’s first lines; many owners never open the PDF.",
      },
      {
        page: "next-steps",
        heading: "Make the open items the point of the call",
        shows: "What’s still open, since when, and the renewals due in the next 90 days.",
        means: NEXT_STEPS_HONEST,
        say: "Use the list as the agenda for your monthly check-in.",
      },
      {
        page: "audit",
        heading: "Show the care, not just the checks",
        shows: "Problems found on the site, with examples, so the client can see what “care” covers.",
        means: "A broken link on the contact page is something an owner understands and is glad you caught.",
        say: "Pick one finding to fix before the next report and say so; it shows the plan doing something.",
      },
    ],
    tips: [
      "Name the tier the client is on and what it includes once a quarter, not every month.",
      "If the client wants more detail, send the full PDF; if not, the summary and dates are enough.",
      "Use the same branding as your proposals so the report looks like part of your service.",
    ],
    faq: [
      {
        q: "What should a care plan report include?",
        a: "Whether the site was up, anything that broke and how it was handled, renewals coming up, and what you’ll do next. Leave out raw logs unless the client asks.",
      },
      {
        q: "Does Client Status log the updates and backups I do?",
        a: "No. It monitors the site from outside and reports what it saw. Mention your hands-on work in your covering email.",
      },
    ],
    tools: ["website-health-report", "domain-expiry-checker"],
    updatedAt: UPDATED,
  },
  {
    slug: "monthly-website-report-for-clients",
    seo: {
      title: "Monthly website report for clients",
      description:
        "What to put in a monthly website report for clients, page by page, with a real white-label sample: summary, availability, security, audit and next steps.",
      path: "/templates/monthly-website-report-for-clients",
    },
    heading: "Monthly website report for clients",
    intro:
      "For agencies starting to send clients a monthly report: what each page is for, in what order, and how long it should take the client to read.",
    pages: ["cover", "availability", "speed-security", "next-steps"],
    sections: [
      {
        page: "cover",
        heading: "Page one: the month in a paragraph",
        shows: "Your branding, the client’s name, the period, a summary and the month at a glance.",
        means: "This is the page that gets forwarded. It should make sense without the rest.",
        say: "Send it on a fixed day; Client Status prepares it on the 1st and holds it for your review by default.",
      },
      {
        page: "availability",
        heading: "Page two: was the website available?",
        shows: "Uptime and incidents per website for the month, with a daily strip.",
        means: "It answers the question clients ask most often, with evidence rather than a reassurance.",
        say: "If nothing happened, one sentence in your email is enough.",
      },
      {
        page: "speed-security",
        heading: "Page three: was it fast and secure?",
        shows: "Response times by day against last month, and certificate and domain dates.",
        means: "Speed is something clients notice; certificates and domains are things they forget until they lapse.",
        say: "Flag any renewal the client handles themselves, such as a domain in their own account.",
      },
      {
        page: "next-steps",
        heading: "Last page: what happens next",
        shows: "Open items, dates to know and notes about any gaps in the data.",
        means: NEXT_STEPS_HONEST,
        say: "Close your email with the one thing you’ll do before the next report.",
      },
    ],
    tips: [
      "Five pages is plenty. A client who has to scroll to find the point stops reading.",
      "Use the same structure every month so changes stand out.",
      "Send a private link as well as the PDF; some clients read on their phone.",
    ],
    faq: [
      {
        q: "How long should a monthly client report be?",
        a: "Long enough to answer “was it fine, and what’s next?” For most sites that’s a summary page and three or four short pages of detail.",
      },
      {
        q: "Do my clients need an account to read it?",
        a: "Not with Client Status: they get a PDF by email or a private link that expires after 30, 60 or 90 days.",
      },
    ],
    tools: ["website-health-report", "ssl-checker"],
    updatedAt: UPDATED,
  },
  {
    slug: "ssl-certificate-report",
    seo: {
      title: "SSL certificate report template",
      description:
        "An SSL certificate report for clients: expiry dates per site, renewals due, domain registration dates and how they’re checked, with a sample PDF.",
      path: "/templates/ssl-certificate-report",
    },
    heading: "SSL certificate report template",
    intro:
      "For agencies looking after many client domains: a monthly view of every certificate and domain renewal, so nothing lapses between reports.",
    pages: ["speed-security", "next-steps"],
    sections: [
      {
        page: "speed-security",
        heading: "One row per website: certificate and domain",
        shows: "Certificate status and expiry date, domain registration date and where that date came from.",
        means:
          "Clients see that both renewals are watched. Where a registry doesn’t publish a domain date, the report says “n/a” instead of guessing.",
        say: "For each “Renewal due”, say whether renewal is automatic and who checks it ran.",
      },
      {
        page: "next-steps",
        heading: "Put renewals on the calendar",
        shows: "Every certificate and domain expiry in the next 90 days, in date order.",
        means:
          "It’s the list your team and the client’s should both have. A lapsed domain takes the site and email down together.",
        say: "If the domain is in the client’s own account, ask them to confirm auto-renew is on.",
      },
    ],
    tips: [
      "Certificates from Let’s Encrypt renew every 90 days or less; a yearly reminder won’t catch a failed renewal.",
      "Check the certificate visitors actually receive. Behind a CDN, that’s the CDN’s certificate.",
      "Keep domain registrar access documented per client; it’s the first thing needed when a domain is about to lapse.",
    ],
    faq: [
      {
        q: "How far ahead should I warn about an expiring certificate?",
        a: "Client Status warns your team 30, 14, 7 and 1 days before expiry, and straight away if a certificate becomes invalid.",
      },
      {
        q: "Why is a domain’s expiry date missing?",
        a: "Some registries don’t publish expiry dates over RDAP. The report shows “n/a” for those; check the date in the registrar account.",
      },
    ],
    tools: ["ssl-checker", "domain-expiry-checker"],
    updatedAt: UPDATED,
  },
  {
    slug: "broken-links-report",
    seo: {
      title: "Broken links report template",
      description:
        "A broken links report clients can act on: each broken link with the page it’s on, sorted by priority with other basic checks, from a real sample PDF.",
      path: "/templates/broken-links-report",
    },
    heading: "Broken links report template",
    intro:
      "For agencies that audit client sites for broken links and basic SEO problems: a short, prioritised list instead of a crawler export nobody reads.",
    pages: ["audit", "next-steps"],
    sections: [
      {
        page: "audit",
        heading: "Group findings by what they cost the client",
        shows: "Fix (affects visitors now), improve (affects search listings) and advisory, with examples and counts.",
        means:
          "Four broken links matter more than seven missing meta descriptions. Sorting says that without a lecture on SEO.",
        say: "Give an example the client recognises (“the link to Dr Lewis’s page from Our Team”) rather than a list of URLs.",
      },
      {
        page: "audit",
        heading: "Say how complete the audit was",
        shows: "Pages crawled against the budget, links checked, and why an audit stopped early if it did.",
        means:
          "A partial audit isn’t a clean bill of health. The report says so rather than implying everything was checked.",
        say: "If the site blocks crawlers or relies on JavaScript, explain that some pages weren’t checked.",
      },
      {
        page: "next-steps",
        heading: "Track fixes month to month",
        shows: "Open audit items with how long they’ve been open.",
        means: NEXT_STEPS_HONEST,
        say: "Fixed items drop off next month; say which ones you fixed so the client sees the list shrink.",
      },
    ],
    tips: [
      "Fix links in menus and footers first: one fix removes the same broken link from every page.",
      "Recheck before reporting. Client Status checks a broken link twice before it appears.",
      "Leave out links you can’t verify (bot challenges, rate limits); reporting them as broken costs you credibility.",
    ],
    faq: [
      {
        q: "How often should a site be checked for broken links?",
        a: "Weekly suits most client sites. Client Status audits weekly, up to the page budget of your plan.",
      },
      {
        q: "Is this an SEO audit?",
        a: "No. It covers basic technical checks: broken links, titles, descriptions, headings and canonical tags. There’s no keyword or ranking data.",
      },
    ],
    tools: ["broken-link-checker", "website-health-report"],
    updatedAt: UPDATED,
  },
];

export const TEMPLATES_HUB: PageSeo = {
  title: "Client report templates for agencies",
  description:
    "Report templates for agencies that look after client websites: maintenance, uptime, care plan, SSL and broken links, each with a real sample report and PDF.",
  path: "/templates",
};

export function getTemplate(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function templatePages(): SitemapPage[] {
  return [
    { path: TEMPLATES_HUB.path, lastModified: UPDATED },
    ...TEMPLATES.map((t) => ({ path: t.seo.path, lastModified: t.updatedAt })),
  ];
}
