# Programmatic SEO plan — Client Status

> Implementation spec for adding programmatic SEO (pSEO) pages to useclientstatus.com.
> Work through the phases in order. Each phase ends with a checklist; do not start the next phase until it passes.
> Read `AGENTS.md` first: this repo runs Next.js 16 with breaking changes. Check `node_modules/next/dist/docs/` for `sitemap`, `robots`, `generateStaticParams`, `generateMetadata` and `cacheComponents` behaviour before writing code.

## 0. Context

**Product:** website monitoring + monthly white-label client reports for web/maintenance agencies. Uptime (1–5 min, confirmed after two failures), SSL (every 6 h), domain expiry via RDAP (daily), weekly technical audits (broken links, missing titles/meta/H1/canonical), email alerts to the team, branded monthly report (PDF + private link). Plans: Starter $49 (15 sites), Growth $99 (50), Pro $199 (150); 14-day Growth trial, no card. Source of truth for plan facts is `lib/plans.ts`. Never hard-code prices in page copy; read them from `PLANS`.

**Current SEO state:** one landing page (`app/page.tsx`), legal pages, `/bot`. No blog, no comparison pages, no tools, no `sitemap.ts`, no `robots.ts`. Domain is new and has low authority.

**Business goal:** sign-ups from agencies, toward US$5k MRR (about 50 Growth accounts). Prioritize pages with buying intent over raw traffic.

## 1. Guardrails (apply to every phase)

1. **No thin or doorway pages.** Google's scaled-content-abuse policy penalises template pages where only one variable changes. Every indexable page must carry data or copy that is specific to that page. If a page can't meet that bar, don't generate it, or mark it `noindex`.
2. **No city/location pages** ("website monitoring in Austin"). No pages per user-submitted domain (e.g. `/ssl/example.com`); tool results are never indexable URLs.
3. **Honest claims only.** Product claims must match what the code does. The landing copy is careful ("not a full SEO tool", "gaps disclosed rather than estimated"); keep that tone. For competitor facts, record the source URL and a `verifiedAt` date in the data file, and say "as of <month year>" on the page.
4. **Ship in waves.** Each content directory launches with a limited set (about 10–30 URLs). Expansion happens after Search Console shows healthy indexing (see §8).
5. **Copy language:** English (the site is English-only, `<html lang="en">`).
6. **Reuse the design system.** `SiteHeader`, `SiteFooter`, `Container`, `SectionHead`, `Faq`, `PricingTable` from `components/landing.tsx`; buttons from `components/ui/button.tsx`. No new UI libraries.
7. **Tests:** add unit tests (vitest) for data loaders and slug/metadata generation, and one Playwright smoke test per directory (hub + one detail page render with 200, a correct `<title>`, a canonical and no redirect to `/sign-in`).

## 2. Phase 1 — Foundation

### 2.1 Make marketing routes public
`proxy.ts` redirects every path not listed in `PUBLIC_PATHS` to `/sign-in` when there's no session cookie, so crawlers would only see redirects. Add the marketing prefixes:

```
/alternatives  /compare  /templates  /tools  /domain-expiry  /for  /errors
```

Add `/sitemap.xml` and `/robots.txt` if the matcher doesn't already skip them (it skips paths with a file extension, so verify). Add a test asserting these prefixes are reachable without a session.

### 2.2 Marketing layout
Create a route group `app/(marketing)/` with a `layout.tsx` that renders `SiteHeader` + `SiteFooter`. Move nothing that exists today; only new pages live here. Shared building blocks go in `components/marketing/`:
- `Breadcrumbs` (also emits `BreadcrumbList` JSON-LD)
- `CtaBand` (start free trial → `/sign-up`, mention the 14-day trial from `TRIAL_DAYS`)
- `ComparisonTable`
- `JsonLd` helper (renders `<script type="application/ld+json">`)
- `UpdatedAt` ("Last updated <date>")

### 2.3 Metadata helper
Create `lib/seo.ts`:
- `SITE_URL` (from env, default `https://useclientstatus.com`)
- `pageMetadata({ title, description, path, ogImage? })` → `Metadata` with an absolute `alternates.canonical`, `openGraph` and `twitter`
- Titles ≤ 60 chars, descriptions 120–160 chars. Add a unit test that fails on violations for every generated page.

### 2.4 sitemap and robots
- `app/robots.ts`: allow `/`; disallow `/r/`, `/api/`, `/ops`, `/onboarding`, and the authenticated app paths (`/overview`, `/websites`, `/clients`, `/incidents`, `/reports`, `/settings`, `/billing`, `/team`). Point to the sitemap.
- Sitemap: one sitemap per directory so Search Console can report indexing per section: `core`, `alternatives`, `compare`, `templates`, `tools`, `domain-expiry`, `for`, `errors`. Include only indexable URLs, with `lastModified` from each data entry.
  - *Done (Phase 1):* `/sitemap.xml` (`app/sitemap.ts`) holds the core pages; each directory adds `app/(marketing)/<section>/sitemap.ts` returning `sitemapEntries("<section>")` and its loader in `SECTION_PAGES` (`lib/seo.ts`). `robots.txt` lists every section with pages. There is no sitemap index: Next.js 16 reserves `/sitemap.xml` for `app/sitemap.ts` (even with `generateSitemaps`), so a custom index route there fails with "Conflicting route and metadata".

### 2.5 Footer and internal linking
Extend `SiteFooter` with a "Resources" column linking to each hub that exists. Hubs link to all of their children. Detail pages link to siblings and across directories (§7).

**Phase 1 checklist:** `npm run typecheck`, `lint` and `test` pass. `curl -I /alternatives` (once it exists) is 200 without a cookie. `/robots.txt` and `/sitemap.xml` render. The landing page still redirects signed-in users to `/overview`.

## 3. Phase 2 — Alternatives & comparisons (highest intent)

### Data
`content/competitors.ts`: typed array, validated with zod at build time.

```ts
type Competitor = {
  slug: string;              // "uptimerobot"
  name: string;
  url: string;
  category: "uptime" | "wp-management" | "agency-reporting";
  pricingSummary: string;    // short, factual, "as of" date shown on page
  freePlan: boolean;
  features: {
    uptime: boolean | "partial";
    ssl: boolean | "partial";
    domainExpiry: boolean | "partial";
    brokenLinks: boolean | "partial";
    clientReports: boolean | "partial";
    whiteLabel: boolean | "partial";
    clientNoLogin: boolean | "partial";
    platformAgnostic: boolean | "partial"; // false for WordPress-only tools
  };
  bestFor: string;           // honest: when to pick the competitor instead
  whyAgenciesSwitch: string[];
  sources: string[];         // pricing/feature page URLs
  verifiedAt: string;        // ISO date
};
```

Research each competitor's current pricing and features page and fill the data from it. Do not fill from memory. Initial set:
- **Uptime:** UptimeRobot, Better Stack, Pingdom, StatusCake, HetrixTools, Updown.io, Uptime Kuma (self-hosted), Oh Dear (closest competitor, so be precise)
- **WordPress management:** ManageWP, MainWP, WP Umbrella, InfiniteWP
- **Agency reporting:** AgencyAnalytics (only if the overlap is real; it's mostly a marketing-reporting tool)

Client Status's own feature row comes from `lib/plans.ts` and the landing copy. Don't invent features: team invites and a custom report domain are not shipped, so don't claim them.

### Pages
- `/alternatives`: hub, grouped by category.
- `/alternatives/[slug]`: "<Name> alternative for agencies". Sections: who it's for, comparison table, where <Name> is the better choice (`bestFor`; this honesty matters for trust and quality), what Client Status adds for agencies (monthly white-label report, clients without accounts, alerts only on confirmed failures, inconclusive checks excluded), pricing side by side, FAQ, CTA. `SoftwareApplication` JSON-LD for Client Status only (no fake ratings).
- `/compare/[a]-vs-[b]`: Client Status vs each competitor (`client-status-vs-uptimerobot`). Optionally add competitor-vs-competitor pairs later, and only for pairs with real search demand.
- Every page shows "Information as of <Month YYYY>" and links its sources.

**Status (2026-11-22): wave 1 shipped.** 10 competitors in `content/competitors.ts` (Oh Dear, UptimeRobot, Better Stack, StatusCake, HetrixTools, Updown.io, Uptime Kuma, ManageWP, MainWP, InfiniteWP), each read from its own site on 2026-11-22. Pages: `/alternatives`, `/alternatives/[slug]`, `/compare`, `/compare/client-status-vs-[slug]`, with sitemaps at `/alternatives/sitemap.xml` and `/compare/sitemap.xml`. Client Status's column comes from `content/client-status.ts` (reads `lib/plans.ts`, SSL thresholds, link expiry). In the data, `false` means "not found on the vendor's pages", and each table's footnote says so. Held back:
- **WP Umbrella**: its site refused automated reads (403), so nothing could be verified. Check it in a browser, then add it.
- **Pingdom**: prices only render in a JavaScript calculator, and SSL or domain monitoring couldn't be confirmed.
- **AgencyAnalytics**: marketing reporting with no website monitoring found, so the overlap isn't real. Skipped as §3 allows.
- Keyword demand (§8) wasn't checked; do it in GSC/Ahrefs before wave 2.
- The `[slug]` pages set `export const instant = false`: they're fully prerendered, and a Suspense boundary around `params` would turn unknown slugs into soft 404s.

**Checklist:** every competitor has `sources` and `verifiedAt`. Unit test: no page has an empty `bestFor`. Each page is meaningfully different (feature tables differ; copy isn't a find/replace of the name).

## 4. Phase 3 — Free tools (lead magnets) + domain-expiry by TLD

### 4.1 Tools
All tools run server-side through the existing safety layers:
- `safeFetch` / `guardedLookup` from `lib/monitoring/safe-fetch.ts` (SSRF guard; never allow private addresses)
- `allow()` from `lib/rate-limit.ts` with `postgresStore`. Key by IP hash, e.g. 10 lookups per 10 min per IP plus a global cap per tool. Check `lib/auth-limits.ts` for how IPs are derived today and reuse it.
- Keep the tool pages themselves static and indexable. Results come back from a server action or an `/api/tools/*` route, render client-side, and are never written to a URL that can be indexed. Results pages, if any, are `noindex`.

Tools:
1. `/tools/ssl-checker`: `checkCertificate` + `evaluateCertificate` (`lib/monitoring/tls-check.ts`). Shows issuer, expiry, days left, and what Client Status would alert on (30/14/7/1-day thresholds from `SSL_THRESHOLD_DAYS`).
2. `/tools/domain-expiry-checker`: `lookupDomainExpiry` (`lib/monitoring/rdap.ts`). When the registry publishes no date, say so ("n/a"), matching product behaviour.
3. `/tools/broken-link-checker`: `crawlSite` (`lib/crawler/crawl.ts`) with tight limits (≤ 50 pages, short timeouts, robots.txt respected, existing User-Agent). If it can't finish within a request, queue it with `lib/jobs/queue.ts` and poll, or email results. Decide based on how the existing job runner works.
4. `/tools/website-health-report` (the main lead magnet): enter URL + email → run SSL + domain + uptime snapshot + mini crawl → render a one-site sample with `renderReportHtml` (single snapshot, clearly labelled "sample, not a monthly report") and email it via `lib/email.ts` (Resend). Store the lead with explicit consent text. Add a Prisma model `ToolLead { id, email, url, tool, createdAt, consent }` plus a migration. Rate-limit by IP and by email.

Each tool page has substantive copy below the tool (what's checked, how to read the result, common causes, how to monitor it automatically) plus a CTA. `WebApplication` JSON-LD.

### 4.2 `/domain-expiry/[tld]`
Generate from the IANA bootstrap (`IANA_BOOTSTRAP_URL`, parsed by `parseBootstrap`). Fetch it at build time and snapshot it to `content/rdap-bootstrap.json` (committed, with a refresh script) so builds are deterministic.
- **Indexable only if the TLD has real per-page data:** RDAP server, registry operator (from IANA root zone data, also snapshotted), TLD type (gTLD/ccTLD), whether expiry dates are typically published (you can test a known domain per TLD once in the refresh script and store the result), plus a short note for TLDs with known quirks.
- **Wave 1:** about 30 high-usage TLDs (.com, .net, .org, .io, .co, .app, .dev, .ai, .co.uk/.uk, .de, .fr, .nl, .es, .it, .com.br, .com.au, .ca, .eu…). Others are generated but `noindex` until wave 2, or not generated at all.
- Hub `/domain-expiry` with a searchable table.
- Each page embeds the domain-expiry checker prefilled with the TLD.

**Checklist:** SSRF tests (reuse the style of `tests/integration/ssrf.test.ts`) cover every tool endpoint. Rate limit verified. Tool results are not indexable. Lead consent is stored.

**Status (2026-11-22): shipped.**
- **Tools.** Four tools at `/tools/*`, all calling `/api/tools/*`. The logic lives in `lib/tools/endpoints.ts`, so the tests can inject the database.
  - SSL and domain checks run inside the request.
  - The broken-link check and the health report become a `ToolRun` that the worker runs (`lib/tools/jobs.ts`), at priority -10 below customer jobs, with a single attempt. A new run is refused while 20 are active. The page polls `GET /api/tools/runs/<id>`, which sends `noindex` and `no-store`.
- **Limits.** 10 requests per IP per 10 minutes plus a global cap per tool. The health report is also limited to 2 per address per day, 3 per IP per hour and 200 per day overall, and has a honeypot field.
- **Request checks.** The API requires the request to come from our own site and accepts bodies of at most 4 KB.
- **Leads.** `ToolLead` stores the consent text verbatim. The marketing opt-in is a separate box, never pre-ticked. Retention is 12 months for leads and 7 days for runs (`prune`). The Privacy Policy was updated and `LEGAL_UPDATED` is now 2026-11-22.
- **Migration.** `20261122120000_free_tools` was generated offline with `prisma migrate diff`, because the local `.env` `DATABASE_URL` points at a remote host. It's applied by `migrate deploy` on deploy.
- **TLDs.** `scripts/refresh-tld-data.ts` writes `content/rdap-bootstrap.json` and `content/tld-data.json`: the IANA category and manager for each TLD, plus real RDAP lookups. A TLD counts as "not published" only when at least two registered domains answer without a date; `nic.uk` alone would have wrongly marked .uk.
  - Wave 1 has 32 TLDs: 16 publish dates, 2 don't (.nl, .au) and 14 have no RDAP server in IANA's bootstrap.
  - TLDs with no RDAP server get a page but `noindex`, because those pages would differ only by name.
- **Tests.** `tests/unit/tools.test.ts`, `tests/integration/tools.test.ts` (SSRF at input and DNS rebinding for every endpoint and both jobs, consent, limits, honeypot, full queue) and new cases in `tests/e2e/marketing.spec.ts`.

## 5. Phase 4 — Report templates & platform pages

### 5.1 `/templates/[slug]`
Targets queries like "website maintenance report template", "uptime report template", "website care plan report", "monthly website report for clients", "SSL certificate report", "broken links report".
- Data: `content/templates.ts` (slug, title, audience, which report sections it highlights, intro copy, FAQ).
- Each page renders a **real sample** using `renderReportHtml` with fictional data. Reuse the fixtures in `scripts/landing-images.ts`: extract them to `lib/reports/fixtures.ts` so both use them, with `.example` domains only. Show page screenshots (generate them with the existing script pattern into `public/templates/<slug>/`) and offer the sample PDF download, generated at build time or by a script, gated by email if desired.
- Page copy explains what each section means for the client and how to write next steps. That explanation is the value of the page, beyond the template itself.

### 5.2 `/for/[platform]`
WordPress, Webflow, Shopify, Squarespace, Wix, Framer, Drupal (start with 6–8).
`content/platforms.ts`: platform-specific failure modes (e.g. WordPress plugin/core updates breaking pages, Webflow-managed SSL, Shopify theme/app script changes, Squarespace/Wix domain-connection issues), what Client Status catches, **what it doesn't** (it doesn't log into CMSs or run updates; unlike ManageWP/MainWP, it is platform-agnostic), and how agencies on that platform package care plans. Must be genuinely platform-specific; if a platform's copy reads like a find/replace of another, cut that platform.

**Status (2026-11-22): shipped.**
- **Templates.** 6 templates at `/templates/[slug]`, plus the hub. All of them show one real sample, `lib/reports/fixtures.ts` rendered by `renderReportHtml`. Each leads with different report pages and has its own explanation.
  - The fixtures now match product output: the summary comes from `summarise()`, open items are "Open" or "Being worked on", and dates and data notes use the aggregate's own wording. The old landing fixture showed statuses and a hand-written cause the product never produces.
  - `npm run landing:images` writes `public/landing/*`, every page into `public/templates/report-*.jpg`, and `public/templates/sample-website-report.pdf`. The download isn't gated.
  - The report has no free-text notes, so the copy tells agencies to put their commentary in the covering email.
- **Platforms.** 7 platforms at `/for/[platform]`: WordPress, Webflow, Shopify, Squarespace, Wix, Framer and Drupal. Each has facts from its own docs, with `sources` and `verifiedAt`. A test fails after 120 days, or if a platform's copy is a find/replace of another's.
- **Links (§7).** `relatedLinks()` in `lib/seo-links.ts` covers competitors, platforms and templates; the error rules come in Phase 5. The alternatives pages now link to their platform pages, their comparison and two templates.

## 6. Phase 5 — Error glossary `/errors/[slug]`
Chrome/Firefox SSL errors (ERR_CERT_DATE_INVALID, ERR_CERT_AUTHORITY_INVALID, ERR_SSL_PROTOCOL_ERROR, NET::ERR_CERT_COMMON_NAME_INVALID, SSL_ERROR_BAD_CERT_DOMAIN…), HTTP 5xx/4xx (500, 502, 503, 504, 520–526 Cloudflare, 403, 404, 429), DNS errors (DNS_PROBE_FINISHED_NXDOMAIN…).
`content/errors.ts`: what it means, likely causes (most likely first), how to fix it as an agency, how the visitor sees it, and how Client Status classifies it. Check `lib/monitoring/classify.ts` so this is accurate; e.g. 429 and bot challenges are "inconclusive", not downtime. That accuracy is the differentiator. Start with about 20 entries. Link the relevant tool (SSL errors → SSL checker).

**Status (2026-11-22): shipped.**
- 22 errors at `/errors/[slug]`, plus the hub, in four groups: certificate/HTTPS, DNS/connection/redirects, HTTP status codes and Cloudflare 52x. Browser wording comes from Chromium's and Firefox's string files; status codes from MDN and RFC 9110; Cloudflare errors from Cloudflare's docs. Each entry lists `sources` and `verifiedAt`.
- "How Client Status classifies it" isn't a hand-written claim. Each entry has `probes` that run the product's own classifiers (`lib/error-probes.ts`: uptime, SSL and audit link checks) on a simulated response; the page shows the summary the app would record, and `tests/unit/errors.test.ts` fails if a classifier change breaks an entry's `expect`.
- Timeouts are inconclusive by design (spec §10), so the 522, 524 and 504 pages say plainly that a check usually times out before Cloudflare or the proxy answers, and that a timeout doesn't open an incident.
- Links (§7): error → its tool + 2 related errors; platform pages now also link up to 3 common errors.

## 7. Internal linking map
- Competitor page → related platform pages (WordPress tools → `/for/wordpress`) + 2 templates + its `/compare` page
- Platform page → relevant alternatives + templates + errors common on that platform
- Template page → tools that produce that data + alternatives in the "agency-reporting" group
- Error page → matching tool + 2 related errors
- TLD page → domain checker + neighbouring TLDs (same type/region)
- Every hub is in the footer. The landing FAQ can link to `/alternatives` and `/tools`.

Implement as a pure function `relatedLinks(page)` in `lib/seo-links.ts`, unit-tested, so links stay consistent.

## 8. Rollout & measurement
| Week | Ship |
|---|---|
| 1–3 | Phase 1 + 10 alternatives + matching compare pages |
| 3–5 | SSL + domain tools, health-report lead magnet |
| 5–8 | Templates (≈10) + platforms (6–8) |
| 8–12 | TLD wave 1 (≈30) + errors (≈20); expand based on data |

- Submit each sitemap separately in Google Search Console; track indexed/submitted per directory.
- **Expansion rule:** expand a directory only when ≥ 70% of its URLs are indexed after about 4 weeks. Below 50% means quality, not quantity, is the problem: improve the pages before adding more.
- **Conversion tracking:** add a `ref` query param (or a cookie set on marketing pages) recording the landing directory, and persist it on sign-up so trials and paid conversions can be attributed per directory. Find where workspaces are created (`lib/data/workspace.ts`) and store `signupSource`.
- **Keyword validation:** before writing each batch, check demand in Ahrefs/Semrush/GSC. Drop slugs with no demand unless they support internal linking.
- Refresh competitor data quarterly (a `verifiedAt` older than 120 days fails a test or prints a build warning).

## 9. Out of scope (for now)
- Blog/CMS (add later for editorial content; pSEO doesn't need it)
- Localised (non-English) pages
- Competitor-vs-competitor pages without proven demand
- Per-domain public result pages
