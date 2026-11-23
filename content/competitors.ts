import { z } from "zod";

// Competitor data for /alternatives and /compare (docs/pseo-plan.md, Phase 2).
//
// Every fact comes from the competitor's own pricing, feature or docs pages listed in `sources`,
// read on `verifiedAt`. Nothing is filled from memory. `false` means "not found on those pages",
// which the pages say in a footnote. Re-verify each entry at least every 120 days (a unit test
// fails after that) and keep the copy honest: `bestFor` says when the competitor is the better pick.
//
// Not in wave 1: WP Umbrella (its site refused automated reads, so nothing could be verified),
// Pingdom (prices only render in a JavaScript calculator; SSL and domain monitoring unconfirmed),
// AgencyAnalytics (marketing reporting; no website monitoring found, so the overlap isn't real).

export const FEATURE_KEYS = [
  "uptime",
  "ssl",
  "domainExpiry",
  "brokenLinks",
  "clientReports",
  "whiteLabel",
  "clientNoLogin",
  "platformAgnostic",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  uptime: "Uptime monitoring",
  ssl: "SSL certificate expiry alerts",
  domainExpiry: "Domain expiry alerts",
  brokenLinks: "Broken link checks",
  clientReports: "Scheduled client reports",
  whiteLabel: "Your branding on what clients see",
  clientNoLogin: "Clients view without an account",
  platformAgnostic: "Works with any website platform",
};

export const CATEGORIES = ["uptime", "wp-management", "agency-reporting"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, { title: string; intro: string }> = {
  uptime: {
    title: "Uptime and status-page tools",
    intro:
      "General monitoring tools. They alert you when a site goes down and often offer public status pages, but few produce a report you'd send a client.",
  },
  "wp-management": {
    title: "WordPress management tools",
    intro:
      "Dashboards that log into WordPress through a plugin to run updates and backups. Monitoring and reports are add-ons, and they only cover WordPress sites.",
  },
  "agency-reporting": {
    title: "Agency reporting tools",
    intro: "Reporting platforms built for agencies' client reports.",
  },
};

const support = z.union([z.boolean(), z.literal("partial")]);
const sentence = z.string().trim().min(20);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const competitorSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(2),
  url: z.url({ protocol: /^https$/ }),
  category: z.enum(CATEGORIES),
  /** One line: what the product is. Hub listings and intros. */
  summary: sentence,
  /** Short and factual; the page adds "as of <month year>". */
  pricingSummary: sentence,
  freePlan: z.boolean(),
  features: z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, support])) as Record<FeatureKey, typeof support>),
  /** Detail shown under a feature in the comparison tables. */
  featureNotes: z.partialRecord(z.enum(FEATURE_KEYS), sentence),
  /** Opening paragraph: who uses it and what it does well. */
  whoItsFor: sentence,
  /** Honest: when to pick the competitor instead. */
  bestFor: sentence,
  whyAgenciesSwitch: z.array(sentence).min(2),
  /** /compare page: reasons to pick each side. */
  chooseThemIf: z.array(sentence).min(2),
  chooseUsIf: z.array(sentence).min(2),
  faq: z.array(z.object({ q: z.string().min(10), a: sentence })).min(1),
  /** Meta descriptions, 120–160 characters (checked by tests/unit/competitors.test.ts). */
  altDescription: z.string(),
  compareDescription: z.string(),
  sources: z.array(z.url({ protocol: /^https$/ })).min(1),
  verifiedAt: isoDate,
});

export type Support = z.infer<typeof support>;
export type Competitor = z.infer<typeof competitorSchema>;

const VERIFIED = "2026-11-22";

const RAW: Competitor[] = [
  {
    slug: "oh-dear",
    name: "Oh Dear",
    url: "https://ohdear.app",
    category: "uptime",
    summary:
      "Broad monitoring for developers and agencies: uptime, certificates, broken links, Lighthouse, DNS, cron jobs, status pages and monthly client reports.",
    pricingSummary:
      "Priced by number of sites in euros, excluding VAT, with every feature on every plan: Freelance €49/month (10 sites), Studio €99 (25), Agency €149 (50), Portfolio Plus €329 (150), up to €399 for 200 sites. 10-day trial without a card; two months free when billed yearly.",
    freePlan: false,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: true,
      clientReports: true,
      whiteLabel: "partial",
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Every minute by default; a failure is confirmed from a second location before it counts as downtime.",
      ssl: "Checked every 30 minutes; warns 7 days ahead for Let's Encrypt and 14 days for other issuers by default.",
      domainExpiry: "Via RDAP; registries without RDAP, such as .be and .de, aren't supported.",
      brokenLinks: "Daily crawl of up to 5,000 pages, plus mixed-content detection.",
      clientReports: "Monthly on the 1st, emailed to up to five recipients per site.",
      whiteLabel: "Your logo and accent colour; a “powered by Oh Dear” mark stays on reports.",
      clientNoLogin: "Report recipients open a browser link without an account.",
    },
    whoItsFor:
      "Oh Dear monitors websites and applications from the outside and goes further than most tools: daily broken-link crawls, Lighthouse scores, DNS and sitemap checks, scheduled-task heartbeats and application health. It also emails monthly client reports, and every feature is on every plan.",
    bestFor:
      "Pick Oh Dear if you want the broadest set of checks (Lighthouse, DNS, cron jobs and application health), daily crawls, a dozen alert channels and public status pages. It has ready-made packages for Laravel and PHP and a reseller programme for agencies. Client Status covers fewer kinds of checks and only alerts by email.",
    whyAgenciesSwitch: [
      "Oh Dear's client reports keep a “powered by Oh Dear” mark. On Client Status Growth and Pro, reports carry only your agency's branding.",
      "Oh Dear emails reports automatically on the 1st. Client Status holds each month's report for your review by default, so nothing reaches a client before you've seen it.",
      "Oh Dear is priced in euros with tiers at 10, 25, 50 and more sites; Client Status bills in US dollars with tiers at 15, 50 and 150 sites.",
    ],
    chooseThemIf: [
      "You want Lighthouse, DNS, sitemap, cron-job or application-health monitoring.",
      "You need alerts in Slack, Teams, SMS or PagerDuty, or a public status page.",
      "You want broken links crawled daily rather than weekly.",
    ],
    chooseUsIf: [
      "Your client reports must carry only your agency's branding.",
      "You want to review each report before it goes out to a client.",
      "Your agency bills in US dollars and fits the 15, 50 or 150-site tiers.",
    ],
    faq: [
      {
        q: "What's the main difference between Oh Dear and Client Status?",
        a: "Oh Dear covers more kinds of checks (Lighthouse, DNS, cron jobs, application health) and more alert channels. Client Status covers fewer checks and is built around the monthly client report: fully white-label on Growth and Pro, held for review before sending, with inconclusive checks kept out of uptime.",
      },
      {
        q: "Does Oh Dear send client reports?",
        a: "Yes. It emails a monthly report on the 1st to up to five recipients per site, with your logo and accent colour and a small “powered by Oh Dear” mark.",
      },
    ],
    altDescription:
      "Comparing Oh Dear for client work? See checks, white-label monthly reports, review before sending and per-site pricing side by side with Client Status.",
    compareDescription:
      "Client Status vs Oh Dear: uptime, SSL, domain and broken-link checks, how each handles monthly client reports and branding, and prices for 15 to 150 sites.",
    sources: [
      "https://ohdear.app/pricing",
      "https://ohdear.app/features/website-uptime-monitoring",
      "https://ohdear.app/features/continuous-certificate-monitoring",
      "https://ohdear.app/features/domain-monitoring",
      "https://ohdear.app/features/broken-page-and-mixed-content-detection",
      "https://ohdear.app/features/client-reporting",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "uptimerobot",
    name: "UptimeRobot",
    url: "https://uptimerobot.com",
    category: "uptime",
    summary: "Popular uptime monitor with a generous free plan, many alert integrations and hosted status pages.",
    pricingSummary:
      "Free plan with 50 monitors at 5-minute checks. Solo from $9/month billed yearly ($10 monthly) with 60-second checks; Team $35/month yearly ($41 monthly) with 100 monitors and 30-second checks; Scale from $65/month yearly.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: "partial",
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Down to 15-second checks on Scale; every 5 minutes on Free.",
      ssl: "Alerts 30, 14 and 7 days before expiry and on the day.",
      domainExpiry: "For HTTP(S) and keyword monitors; its pricing page and blog differ on which plans include it.",
      clientReports:
        "Monthly uptime emails to the account owner and SLA email reports you can forward; no branded client report found.",
      whiteLabel: "White-label status pages from the Team plan.",
      clientNoLogin: "Public status pages; password protection from Solo.",
    },
    whoItsFor:
      "UptimeRobot is a general-purpose uptime monitor for websites, APIs, servers and ports. It's often the first tool an agency adds: the free plan covers 50 monitors, alerts reach email, SMS, voice calls and chat apps, and status pages show anyone whether a site is up right now.",
    bestFor:
      "Pick UptimeRobot if you mostly need fast, cheap alerting across many endpoints (APIs, ports, keyword checks, heartbeats) and a public status page. Its free plan and 15-second checks on Scale are hard to beat, and it has far more alert channels than Client Status, which only emails your team.",
    whyAgenciesSwitch: [
      "Clients rarely check status pages. They want a monthly summary they can forward to whoever pays the invoice, and UptimeRobot's monthly reports go to you, not to them.",
      "UptimeRobot doesn't crawl sites, so broken links and missing titles or descriptions go unnoticed until a client finds them.",
      "Uptime alone doesn't show the work behind a care plan. A report that also covers certificates, domains and audit findings does.",
    ],
    chooseThemIf: [
      "You monitor APIs, ports, cron jobs or servers, not just websites.",
      "You need SMS, voice-call or Slack alerts.",
      "You want a free plan or checks faster than once a minute.",
    ],
    chooseUsIf: [
      "You want every client to get a branded monthly report without assembling it yourself.",
      "You need broken-link and basic SEO checks alongside uptime.",
      "You'd rather not count rate-limited or bot-challenged checks as either uptime or downtime.",
    ],
    faq: [
      {
        q: "Is UptimeRobot free?",
        a: "Yes. Its Free plan covers 50 monitors at 5-minute intervals, with one status page and up to five integrations. Client Status has no free plan; it starts with a free trial.",
      },
      {
        q: "Can I use UptimeRobot and Client Status together?",
        a: "Yes. Some agencies keep UptimeRobot for API or server checks and SMS alerts, and use Client Status for website health and the monthly client report.",
      },
    ],
    altDescription:
      "Looking for an UptimeRobot alternative for client sites? Compare uptime, SSL and domain alerts, broken-link checks and branded monthly client reports.",
    compareDescription:
      "Client Status vs UptimeRobot for agencies: alert channels and status pages versus monthly white-label client reports, audits and pricing side by side.",
    sources: [
      "https://uptimerobot.com/pricing/",
      "https://uptimerobot.com/status-page/",
      "https://uptimerobot.com/ssl-monitoring/",
      "https://uptimerobot.com/blog/monitor-domain-expiration/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "better-stack",
    name: "Better Stack",
    url: "https://betterstack.com/uptime",
    category: "uptime",
    summary:
      "Monitoring and incident-management platform with on-call scheduling, phone alerts and status pages sold as add-ons.",
    pricingSummary:
      "Free tier with 10 monitors, 3-minute checks and one status page. Paid use is priced by add-on: 50 extra monitors for $21/month billed yearly ($25 monthly), on-call responder seats from $29/month, white-label status pages $208 per page per month billed yearly.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: "partial",
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Checks as often as every 30 seconds; incidents are verified from at least three locations.",
      domainExpiry: "Listed as TLD expiration monitoring.",
      clientReports: "SLA reporting add-on priced per team member, with CSV export; no scheduled client report found.",
      whiteLabel: "White-label status pages as a paid add-on per page.",
      clientNoLogin: "Public status pages; password or SSO protection are paid add-ons.",
    },
    whoItsFor:
      "Better Stack Uptime is part of a larger observability suite with logs, incident management and on-call. It suits engineering teams who need phone-call alerts, escalation policies and an incident timeline as much as the uptime check itself.",
    bestFor:
      "Pick Better Stack if your agency runs on-call rotations for client applications, needs phone and SMS escalation, or already uses its logs. Incidents are verified from at least three locations and the status pages are polished, though branding each one is a paid add-on.",
    whyAgenciesSwitch: [
      "Per-page add-ons add up: removing Better Stack branding from a client's status page is listed at $208 per page per month billed yearly.",
      "Its reporting is built for SLA tracking and CSV export, not a client-ready monthly document.",
      "There's no crawler, so broken links and missing page titles aren't covered.",
    ],
    chooseThemIf: [
      "You need on-call schedules, escalation and phone-call alerts.",
      "You want logs and incident management in the same tool.",
      "You monitor APIs, heartbeats or mail servers, not just websites.",
    ],
    chooseUsIf: [
      "You look after many client sites and want flat pricing by number of sites.",
      "Your clients need a monthly report with your branding, not a status page.",
      "You want weekly broken-link and basic SEO audits included.",
    ],
    faq: [
      {
        q: "Does Better Stack have a free plan?",
        a: "Yes: 10 monitors and heartbeats with 3-minute checks and one status page. Client Status has no free plan, only a free trial.",
      },
      {
        q: "Is Better Stack too much for a small agency?",
        a: "It depends on what you deliver. If you run on-call support for client applications, its incident tools earn their place. If you mostly maintain marketing sites and report to clients monthly, much of it goes unused.",
      },
    ],
    altDescription:
      "A Better Stack alternative for agencies that maintain client websites: flat pricing per site, weekly audits and a white-label monthly report per client.",
    compareDescription:
      "Client Status vs Better Stack: on-call and incident tooling versus client website monitoring with branded monthly reports. Features and pricing side by side.",
    sources: ["https://betterstack.com/pricing", "https://betterstack.com/uptime"],
    verifiedAt: VERIFIED,
  },
  {
    slug: "statuscake",
    name: "StatusCake",
    url: "https://www.statuscake.com",
    category: "uptime",
    summary: "Uptime, page-speed, SSL and domain monitoring with a free plan and white-label reporting on paid plans.",
    pricingSummary:
      "Free plan with 10 uptime monitors at 5-minute checks plus one SSL and one domain monitor. Paid Superior (100 monitors, 1-minute checks) and Business (300 monitors, 30-second checks) plans, priced in your local currency; 7-day trial without a card.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: "partial",
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Every 5 minutes on Free, 1 minute on Superior, 30 seconds on Business.",
      ssl: "Alerts can be set for 1, 14 and 30 days before expiry; monitors are counted separately from uptime.",
      domainExpiry: "Expiry reminders plus WHOIS and record checks; counted separately from uptime monitors.",
      clientReports: "Reporting on paid plans; we found no detail on scheduling or emailing reports to clients.",
      whiteLabel: "White-label reporting, and status pages without StatusCake branding.",
      clientNoLogin: "Status pages, optionally protected by password or IP list, are a separate subscription.",
    },
    whoItsFor:
      "StatusCake monitors uptime from around 30 countries and adds page-speed, SSL, domain and server monitoring. Paid plans include reporting with a white-label option, and status pages are sold as a separate product.",
    bestFor:
      "Pick StatusCake if you want page-speed tests every few minutes, server monitoring or 30-second uptime checks, and you're comfortable building client reporting from its reports and status pages.",
    whyAgenciesSwitch: [
      "Status pages are a separate subscription on top of monitoring.",
      "Uptime, SSL, domain and page-speed monitors each have their own limit, so covering every check for 50 client sites means watching several allowances.",
      "There's no crawler: broken links and missing titles or meta descriptions aren't checked.",
    ],
    chooseThemIf: [
      "You want frequent page-speed monitoring.",
      "You also monitor servers.",
      "You need 30-second uptime checks.",
    ],
    chooseUsIf: [
      "Each client site should get uptime, SSL, domain and audit checks without counting monitors per type.",
      "You want a finished monthly report per client, held for your review.",
      "Broken-link and basic SEO checks are part of your care plans.",
    ],
    faq: [
      {
        q: "Does StatusCake have white-label reports?",
        a: "Its pricing page lists white-label reporting on paid plans. We couldn't find whether reports can be scheduled or emailed to clients automatically.",
      },
      {
        q: "Does StatusCake check for broken links?",
        a: "We didn't find a broken-link or crawl feature on its pricing or feature pages. Client Status crawls each site weekly and confirms a broken link twice before reporting it.",
      },
    ],
    altDescription:
      "Need a StatusCake alternative for client websites? Uptime, SSL, domain and broken-link checks in one plan, plus a white-label monthly report per client.",
    compareDescription:
      "Client Status vs StatusCake for agencies: per-type monitor limits and status pages versus per-site plans with audits and branded monthly client reports.",
    sources: [
      "https://www.statuscake.com/pricing/",
      "https://www.statuscake.com/features/ssl/",
      "https://www.statuscake.com/features/domain/",
      "https://www.statuscake.com/status-page/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "hetrixtools",
    name: "HetrixTools",
    url: "https://hetrixtools.com",
    category: "uptime",
    summary: "Low-cost uptime, server and blacklist monitoring with 1-minute checks and white-label status pages.",
    pricingSummary:
      "Free plan with 15 uptime monitors. Professional $9.95/month (30 monitors), Business $19.95/month (60 monitors, full white label), Enterprise $49.95/month (200 monitors); yearly billing costs about ten months. 1-minute checks on every plan.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: "partial",
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Every minute from up to 12 locations, depending on plan.",
      ssl: "Reminders 1 to 30 days ahead, plus hostname and validity checks.",
      domainExpiry: "Reminders 1 to 30 days ahead, plus nameserver change detection.",
      clientReports: "Weekly and monthly uptime reports, public or private; PDF or email delivery not described.",
      whiteLabel: "Full white label on Business and Enterprise; partial on Free and Professional.",
      clientNoLogin: "Public status pages and public reports on every plan.",
    },
    whoItsFor:
      "HetrixTools is popular with hosting providers. It combines uptime checks, server agents and IP and domain blacklist monitoring, with status pages and reports you can put on your own domain.",
    bestFor:
      "Pick HetrixTools if price per monitor matters most, if you manage servers or mail IPs that can land on blacklists, or if you want fully white-labelled status pages on a low monthly plan. Free accounts must log in at least once every 90 days.",
    whyAgenciesSwitch: [
      "Its reports are about uptime; certificates, domains and on-page issues aren't summarised for the client in one document.",
      "No crawler, so broken links and missing titles aren't checked.",
      "It's built around hosting needs such as servers and blacklists, which many web agencies don't use.",
    ],
    chooseThemIf: [
      "You run servers or mail IPs and need blacklist monitoring.",
      "Cost per monitor is the deciding factor.",
      "You want white-label status pages on your own domain.",
    ],
    chooseUsIf: [
      "You want one monthly report per client covering uptime, certificates, domains and audit findings.",
      "You need broken-link and basic SEO audits.",
      "Clients should receive a PDF and a private link rather than visit a status page.",
    ],
    faq: [
      {
        q: "Is HetrixTools free?",
        a: "Yes. Its Free plan includes 15 uptime monitors with 1-minute checks, as long as you log in at least once every 90 days.",
      },
      {
        q: "Can HetrixTools reports be white-labelled?",
        a: "Business and Enterprise plans have full white label, which removes HetrixTools branding from reports. Free and Professional have partial white label.",
      },
    ],
    altDescription:
      "Looking past HetrixTools for client work? Compare uptime, SSL and domain alerts, broken-link audits and a branded monthly report for each client website.",
    compareDescription:
      "Client Status vs HetrixTools: hosting-focused uptime and blacklist monitoring versus client website health with audits and white-label monthly reports.",
    sources: [
      "https://hetrixtools.com/pricing/uptime-monitor/",
      "https://hetrixtools.com/feature/uptime-monitor-core/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "updown-io",
    name: "Updown.io",
    url: "https://updown.io",
    category: "uptime",
    summary: "Minimal pay-as-you-go uptime monitor: you buy credits and spend one per check.",
    pricingSummary:
      "Credit-based, in euros excluding VAT: for example 200,000 credits for €5 or 1,500,000 for €25. Its own example is 10 websites checked every 2 minutes from €1.83/month. New accounts get 100,000 free credits.",
    freePlan: false,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: "partial",
      whiteLabel: false,
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "Any interval from 15 seconds to an hour; each check costs one credit.",
      ssl: "Notices 30, 14, 7 and 1 days before expiry (the 30-day notice is skipped for Let's Encrypt and ZeroSSL).",
      domainExpiry: "Alerts before a domain expires, using RDAP or WHOIS.",
      clientReports: "Hosted status pages with availability and performance reports; no scheduled client report found.",
      clientNoLogin: "Hosted single-site and multi-site status pages.",
    },
    whoItsFor:
      "Updown.io is a deliberately simple uptime monitor for developers. There are no plans: you choose how often each URL is checked and pay only for the checks you use.",
    bestFor:
      "Pick Updown.io if you want cheap, no-frills monitoring with fine-grained intervals (15 seconds to an hour) and a clean API, and you don't need branded client output.",
    whyAgenciesSwitch: [
      "We found no option to put your agency's branding on its status pages or reports.",
      "There's no monthly client report; you'd assemble one yourself.",
      "No audits: broken links and on-page issues aren't checked.",
    ],
    chooseThemIf: [
      "You'd rather pay per check than a monthly plan.",
      "You need checks as often as every 15 seconds on a few URLs.",
      "You only need alerts, not client-facing reports.",
    ],
    chooseUsIf: [
      "Your agency sends clients a monthly report under its own brand.",
      "You want SSL, domain and weekly audit results in that report.",
      "Predictable pricing by number of client sites matches how you bill care plans.",
    ],
    faq: [
      {
        q: "How much does Updown.io cost for 10 sites?",
        a: "Its homepage gives the example of 10 websites checked every 2 minutes from €1.83 a month. Faster checks use more credits.",
      },
      {
        q: "Does Updown.io monitor domain expiry?",
        a: "Yes. It alerts when domains are about to expire, using RDAP or WHOIS.",
      },
    ],
    altDescription:
      "An Updown.io alternative for agencies that report to clients: uptime, SSL, domain and broken-link checks with a white-label monthly report for each site.",
    compareDescription:
      "Client Status vs Updown.io: pay-per-check developer monitoring versus per-site plans with weekly audits and branded monthly reports for agency clients.",
    sources: ["https://updown.io/", "https://updown.io/doc/ssl-expiration-notifications"],
    verifiedAt: VERIFIED,
  },
  {
    slug: "uptime-kuma",
    name: "Uptime Kuma",
    url: "https://github.com/louislam/uptime-kuma",
    category: "uptime",
    summary:
      "Free, open-source uptime monitor you host yourself, with dozens of notification services and status pages.",
    pricingSummary:
      "Free and open source under the MIT licence. You host it yourself with Docker or Node.js, so the cost is a server and the time to maintain it.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: "partial",
      domainExpiry: false,
      brokenLinks: false,
      clientReports: false,
      whiteLabel: "partial",
      clientNoLogin: true,
      platformAgnostic: true,
    },
    featureNotes: {
      uptime: "HTTP, keyword, JSON query, TCP, ping, DNS, Docker and more, at intervals down to 20 seconds.",
      ssl: "Shows certificate information; its README doesn't describe expiry alerts.",
      whiteLabel: "Status pages can be served on your own domain; branding options aren't documented.",
      clientNoLogin: "Status pages are meant for public visitors.",
    },
    whoItsFor:
      "Uptime Kuma is a self-hosted monitoring app with a large open-source community. You run it on your own server, add monitors of many types and send alerts to more than 90 notification services.",
    bestFor:
      "Pick Uptime Kuma if you're comfortable running and updating your own server, want as many monitors as your server can handle at no licence cost, or need monitor types such as Docker containers, DNS records or game servers.",
    whyAgenciesSwitch: [
      "You're responsible for keeping it running, updated and backed up. If its server goes down, so does your monitoring.",
      "There are no client reports; turning its data into a monthly summary is manual.",
      "There's no crawler, and domain expiry isn't among its documented features.",
    ],
    chooseThemIf: [
      "You want free, self-hosted monitoring and have someone to maintain it.",
      "You need unusual monitor types such as Docker containers, DNS records or game servers.",
      "You want alerts in one of the many chat or push services it supports.",
    ],
    chooseUsIf: [
      "You'd rather not host and patch your monitoring yourself.",
      "Clients expect a branded monthly report.",
      "You want domain expiry, broken-link and basic SEO checks included.",
    ],
    faq: [
      {
        q: "Is Uptime Kuma really free?",
        a: "Yes. It's open source under the MIT licence. You pay for the server it runs on and the time to keep it updated.",
      },
      {
        q: "Can Uptime Kuma send reports to clients?",
        a: "We didn't find a reporting feature in its README, wiki or recent release notes. Its status pages can be shared publicly and served on your own domain.",
      },
    ],
    altDescription:
      "An Uptime Kuma alternative you don't have to host: uptime, SSL, domain and broken-link monitoring with a white-label monthly report for every client site.",
    compareDescription:
      "Client Status vs Uptime Kuma: free self-hosted monitoring you maintain versus a hosted service with audits and branded monthly reports for agency clients.",
    sources: ["https://github.com/louislam/uptime-kuma", "https://github.com/louislam/uptime-kuma/wiki/Status-Page"],
    verifiedAt: VERIFIED,
  },
  {
    slug: "managewp",
    name: "ManageWP",
    url: "https://managewp.com",
    category: "wp-management",
    summary:
      "WordPress management dashboard from GoDaddy: updates, backups and security, with paid add-ons for uptime, client reports and white label.",
    pricingSummary:
      "Free core for unlimited WordPress sites. Premium add-ons such as Uptime Monitor, Advanced Client Reports, White Label and Link Monitor cost $1 per site per month each (backups $2), or a $25 bundle per add-on for up to 100 sites; all bundles together are $150/month.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: false,
      domainExpiry: false,
      brokenLinks: true,
      clientReports: true,
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: false,
    },
    featureNotes: {
      uptime: "Paid add-on; checks every 60 seconds and double-checks before alerting.",
      brokenLinks: "Link Monitor, a paid add-on that scans WordPress sites for broken links.",
      clientReports:
        "Free PDF reports with a ManageWP watermark; scheduled weekly, fortnightly or monthly delivery needs the paid add-on.",
      whiteLabel:
        "Rebrands the Worker plugin on client sites; paid reports drop the watermark and send from your address.",
      clientNoLogin: "Reports are sent as email or PDF.",
      platformAgnostic: "WordPress only, connected through the ManageWP Worker plugin.",
    },
    whoItsFor:
      "ManageWP is a WordPress management dashboard. You connect each site through its Worker plugin, then update plugins and themes, run backups and security checks, and add paid modules for uptime, client reports and white label.",
    bestFor:
      "Pick ManageWP if every client site runs WordPress and you want updates, backups and monitoring in one place. Running updates and restoring backups is something Client Status doesn't do at all.",
    whyAgenciesSwitch: [
      "Only WordPress sites can be connected; Webflow, Shopify or custom-built sites need another tool.",
      "We found no SSL certificate or domain expiry monitoring on its feature pages.",
      "Each add-on is priced per site, so the bill grows with every module you switch on.",
    ],
    chooseThemIf: [
      "All your client sites run WordPress.",
      "You want plugin, theme and core updates and backups from the same dashboard.",
      "You want keyword ranking or vulnerability scanning add-ons.",
    ],
    chooseUsIf: [
      "Your clients' sites run on different platforms.",
      "You need SSL certificate and domain expiry alerts.",
      "You don't want to install a plugin on every client site just to monitor it.",
    ],
    faq: [
      {
        q: "Can I use ManageWP and Client Status together?",
        a: "Yes. ManageWP handles updates and backups inside WordPress; Client Status monitors from outside and produces the monthly client report. They overlap very little.",
      },
      {
        q: "Does ManageWP monitor SSL certificates?",
        a: "We couldn't find SSL certificate or domain expiry monitoring on ManageWP's pricing or feature pages.",
      },
    ],
    altDescription:
      "A ManageWP alternative for monitoring and client reports on any platform: uptime, SSL, domain and broken-link checks with white-label monthly reports.",
    compareDescription:
      "Client Status vs ManageWP: WordPress updates and per-site add-ons versus platform-agnostic monitoring with SSL, domain alerts and branded monthly reports.",
    sources: [
      "https://managewp.com/pricing",
      "https://managewp.com/features",
      "https://managewp.com/features/uptime-monitor/",
      "https://managewp.com/features/client-report/",
      "https://managewp.com/features/white-label/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "mainwp",
    name: "MainWP",
    url: "https://mainwp.com",
    category: "wp-management",
    summary:
      "Self-hosted WordPress management: a dashboard plugin on your own WordPress site that connects to client sites through a child plugin.",
    pricingSummary:
      "Essentials is free for unlimited sites, with updates, backups and uptime monitoring. Pro adds client reports, white label and 35+ add-ons for unlimited sites at $29/month, $199/year list price or $599 for a lifetime licence.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: true,
      domainExpiry: true,
      brokenLinks: false,
      clientReports: true,
      whiteLabel: true,
      clientNoLogin: true,
      platformAgnostic: false,
    },
    featureNotes: {
      uptime: "Every 5 minutes at most often, once an hour by default; email alerts.",
      ssl: "SSL Monitor extension (Pro).",
      domainExpiry: "Domain Monitor extension (Pro).",
      clientReports: "Pro Reports: branded PDF or HTML emailed daily, weekly or monthly.",
      whiteLabel: "White Label extension brands the child plugin and WP Admin; reports take your logo and colours.",
      clientNoLogin: "Reports are emailed to each client.",
      platformAgnostic: "WordPress only; every site needs the MainWP Child plugin.",
    },
    whoItsFor:
      "MainWP is self-hosted: you install the dashboard as a plugin on your own WordPress site, then add the MainWP Child plugin to every client site. It's built for agencies selling WordPress care plans, with updates, backups and uptime in the free version.",
    bestFor:
      "Pick MainWP if your clients are all on WordPress, you want management data on your own server, and you want updates, backups and reports for one flat price with no per-site fees.",
    whyAgenciesSwitch: [
      "It's WordPress-only and needs its child plugin on every client site.",
      "Uptime checks run every 5 minutes at the fastest and default to once an hour.",
      "Self-hosting means you maintain the dashboard, its updates and its backups yourself.",
    ],
    chooseThemIf: [
      "All your client sites run WordPress.",
      "You want to run updates and backups, not only monitor.",
      "You prefer self-hosted software with a lifetime licence option.",
    ],
    chooseUsIf: [
      "You manage sites on several platforms.",
      "You don't want to host and maintain your own management dashboard.",
      "You want weekly broken-link and basic SEO audits in the client report.",
    ],
    faq: [
      {
        q: "Is MainWP free?",
        a: "The Essentials version is free for unlimited sites and includes updates, backups and uptime monitoring. Client reports, white label, and SSL and domain monitoring are Pro features.",
      },
      {
        q: "Does MainWP need a plugin on client sites?",
        a: "Yes. Each client site needs the MainWP Child plugin, and Pro Reports also needs the Child Reports plugin.",
      },
    ],
    altDescription:
      "A MainWP alternative with nothing to self-host and no plugins on client sites: uptime, SSL, domain and broken-link checks plus white-label monthly reports.",
    compareDescription:
      "Client Status vs MainWP: self-hosted WordPress management versus hosted, platform-agnostic monitoring with audits and branded monthly client reports.",
    sources: [
      "https://mainwp.com/pricing/",
      "https://mainwp.com/mainwp-uptime-monitoring/",
      "https://mainwp.com/add-on/pro-reports/",
      "https://mainwp.com/mainwp-add-ons/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "infinitewp",
    name: "InfiniteWP",
    url: "https://infinitewp.com",
    category: "wp-management",
    summary:
      "Self-hosted WordPress admin panel with free updates and backups, and premium plans that add uptime monitoring and client reporting.",
    pricingSummary:
      "The admin panel is free for unlimited sites. Premium features come in annual licences tiered by number of sites, and uptime monitoring and client reporting are included in every premium plan. Refunds within 14 days of purchase.",
    freePlan: true,
    features: {
      uptime: true,
      ssl: false,
      domainExpiry: false,
      brokenLinks: true,
      clientReports: "partial",
      whiteLabel: "partial",
      clientNoLogin: true,
      platformAgnostic: false,
    },
    featureNotes: {
      uptime: "Premium; ping, keyword or port checks with email alerts. Check frequency isn't stated.",
      brokenLinks: "Find and fix broken links across WordPress sites.",
      clientReports: "Premium, with three report templates; scheduling and format aren't described.",
      whiteLabel: "Brands the client plugin installed on each site.",
      clientNoLogin: "Reports are sent to clients.",
      platformAgnostic: "WordPress only, through a client plugin on each site.",
    },
    whoItsFor:
      "InfiniteWP is a self-hosted admin panel for managing many WordPress sites: one-click updates, backups and maintenance, with uptime monitoring, client reporting and malware scanning in its premium plans.",
    bestFor:
      "Pick InfiniteWP if you want a free, self-hosted WordPress panel for updates and backups and you're happy to pay yearly for extras such as staging-tested updates and malware scans.",
    whyAgenciesSwitch: [
      "It only manages WordPress sites, through a client plugin on each one.",
      "We found no SSL certificate or domain expiry monitoring.",
      "Its pages don't say how often uptime is checked or whether reports can be scheduled.",
    ],
    chooseThemIf: [
      "All your client sites run WordPress.",
      "You want one-click updates and backups in a self-hosted panel.",
      "You need malware scanning or staging-tested updates.",
    ],
    chooseUsIf: [
      "Your clients use different platforms.",
      "You need SSL certificate and domain expiry alerts.",
      "You want monthly reports that go out on a schedule with your branding.",
    ],
    faq: [
      {
        q: "Is InfiniteWP free?",
        a: "The admin panel is free for unlimited sites, with updates and backups. Uptime monitoring and client reporting need a premium licence.",
      },
      {
        q: "Does InfiniteWP work with non-WordPress sites?",
        a: "No. It describes itself as a panel for WordPress sites, and each site needs its client plugin.",
      },
    ],
    altDescription:
      "An InfiniteWP alternative for monitoring any client site: uptime, SSL and domain expiry alerts, broken-link audits and a white-label monthly report.",
    compareDescription:
      "Client Status vs InfiniteWP: self-hosted WordPress updates and backups versus hosted monitoring of any platform with branded monthly client reports.",
    sources: ["https://infinitewp.com/", "https://new.infinitewp.com/pricing/", "https://new.infinitewp.com/features/"],
    verifiedAt: VERIFIED,
  },
];

export const COMPETITORS: readonly Competitor[] = z
  .array(competitorSchema)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const c of list) {
      if (seen.has(c.slug)) ctx.addIssue({ code: "custom", message: `Duplicate competitor slug: ${c.slug}` });
      seen.add(c.slug);
    }
  })
  .parse(RAW);

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

export function competitorsIn(category: Category): Competitor[] {
  return COMPETITORS.filter((c) => c.category === category);
}

/** Categories that have at least one competitor, in display order. */
export function activeCategories(): Category[] {
  return CATEGORIES.filter((cat) => competitorsIn(cat).length > 0);
}

/** "client-status-vs-uptimerobot" */
export function compareSlug(c: Pick<Competitor, "slug">): string {
  return `client-status-vs-${c.slug}`;
}

export function competitorForCompareSlug(slug: string): Competitor | undefined {
  const prefix = "client-status-vs-";
  return slug.startsWith(prefix) ? getCompetitor(slug.slice(prefix.length)) : undefined;
}

/** Most recent verification date across a list (for hub pages and sitemaps). */
export function latestVerifiedAt(list: readonly Competitor[] = COMPETITORS): string {
  return list.reduce((max, c) => (c.verifiedAt > max ? c.verifiedAt : max), "0000-00-00");
}

/** Competitors in the same category, excluding this one (sibling links). */
export function siblings(c: Competitor): Competitor[] {
  return competitorsIn(c.category).filter((o) => o.slug !== c.slug);
}
