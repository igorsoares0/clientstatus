# Spec-Driven Development — Agency Website Health Monitoring SaaS

**Status:** Draft for implementation  
**Version:** 1.0  
**Product type:** Multi-tenant B2B SaaS  
**Primary audience:** Digital marketing agencies and website maintenance agencies  
**Initial market:** International, English-first UI  
**Pricing hypothesis:** US$49 / US$99 / US$149 per month

---

## 1. Product Overview

### 1.1 Vision

Build a website monitoring and health management platform for agencies that manage multiple client websites. The product combines continuous availability monitoring, SSL/domain checks, scheduled technical audits, incident management, and automated client-ready monthly reports.

It serves two related workflows:

1. **Operational maintenance:** detect downtime, certificate/domain expiration, broken links, and basic technical SEO issues.
2. **Client communication:** show clients a clear summary of website health and work requiring attention, using agency branding and automated monthly reports.

The product is not intended to be a full observability platform, vulnerability scanner, or replacement for a comprehensive SEO suite in v1.

### 1.2 Core value proposition

- Monitor many client websites from one agency workspace.
- Detect issues and notify the agency without manual checks.
- Organize sites by client and track incidents over time.
- Generate branded monthly PDF reports automatically.
- Reduce recurring reporting and monitoring work for agency teams.

### 1.3 Product principles

- Agency-first, not infrastructure-engineer-first.
- Clear, actionable information instead of noisy dashboards.
- Reliable monitoring with explicit status and timestamps.
- Monthly reports are first-class; weekly reports are out of scope for v1.
- Simple architecture with one main language: TypeScript.
- Keep operating costs predictable through limits and controlled crawling.
- Secure tenant isolation and safe outbound URL handling are mandatory.

---

## 2. Goals and Non-Goals

### 2.1 Goals for v1

- Multi-tenant agency workspaces.
- Clients and multiple websites per client.
- HTTP/HTTPS uptime monitoring and response-time history.
- SSL certificate validity and expiry monitoring.
- Domain expiry checks when registry/RDAP data is available.
- Basic DNS lookup and change detection.
- Scheduled internal/external broken-link crawls with safe limits.
- Basic technical SEO checks.
- Incident lifecycle, email alerts, and alert-noise controls.
- Automated monthly PDF reports with agency branding.
- Private report-sharing links.
- Subscription plans with site and feature limits.
- Import multiple sites using CSV.
- Basic operational visibility for worker health and failed jobs.

### 2.2 Non-goals for v1

- Weekly report delivery.
- Full SEO keyword tracking, backlinks, rank tracking, or competitor research.
- Full vulnerability scanning or penetration testing.
- Automatic WordPress/plugin updates.
- Visual regression detection and screenshot comparisons.
- Form submission or checkout transaction testing.
- Public API for customers.
- Mobile apps.
- AI-generated recommendations.
- Complex client portal with user accounts for every end client.
- Unlimited crawl depth or unlimited crawl frequency.
- Guaranteed detection of every domain expiry date when registry data is unavailable.

---

## 3. Target Users and Jobs to Be Done

### 3.1 Agency owner

Needs to understand the health of the entire website portfolio, control costs, manage subscriptions, and prove value to clients.

### 3.2 Account manager

Needs to see which client websites need attention and share understandable reports without assembling data manually.

### 3.3 Website maintenance specialist

Needs actionable incidents, diagnostic details, history, and clear distinction between transient failures and confirmed problems.

### 3.4 End client / report recipient

Receives a branded monthly report or private report link. In v1, the end client does not need a full authenticated account.

---

## 4. Product Scope and Functional Requirements

Priority definitions:
- **P0:** required for launch.
- **P1:** valuable, but can follow shortly after launch.
- **P2:** future enhancement.

### 4.1 Authentication and agency workspace

**FR-AUTH-01 (P0):** Users can sign up, sign in, sign out, and reset their password.  
**FR-AUTH-02 (P0):** Each account belongs to one agency workspace in v1.  
**FR-AUTH-03 (P0):** All customer data is scoped to its workspace.  
**FR-AUTH-04 (P1):** Workspace owners can invite team members.  
**FR-AUTH-05 (P1):** Support role-based access: Owner, Admin, Member.  
**FR-AUTH-06 (P0):** Enforce authorization on the server for every workspace-owned resource. Hiding UI elements is not sufficient.

### 4.2 Client management

**FR-CLIENT-01 (P0):** Create, view, edit, and archive clients.  
**FR-CLIENT-02 (P0):** A client can have multiple websites.  
**FR-CLIENT-03 (P0):** Client fields: name, optional contact name, optional contact email, notes, status, created/updated timestamps.  
**FR-CLIENT-04 (P0):** Search and filter clients.  
**FR-CLIENT-05 (P0):** Archiving a client must not silently delete monitoring history or reports.

### 4.3 Website management

**FR-SITE-01 (P0):** Add, edit, pause, resume, and archive websites.  
**FR-SITE-02 (P0):** Normalize and validate submitted URLs. Accept only HTTP and HTTPS URLs.  
**FR-SITE-03 (P0):** Store a canonical base URL and a display name.  
**FR-SITE-04 (P0):** Allow optional client assignment; sites without a client appear in an unassigned group.  
**FR-SITE-05 (P0):** Show current status, last check time, latest response time, active incident count, and last audit time.  
**FR-SITE-06 (P0):** Import websites from CSV with validation preview, duplicate detection, and row-level errors.  
**FR-SITE-07 (P0):** Enforce plan site limits on creation, import, and reactivation.  
**FR-SITE-08 (P0):** Paused sites do not schedule checks but preserve history.  
**FR-SITE-09 (P0):** Archiving a site stops scheduled checks but preserves historical records according to retention rules.

### 4.4 Uptime monitoring

**FR-UP-01 (P0):** Perform HTTP/HTTPS checks on each active website according to its plan.  
**FR-UP-02 (P0):** Record check timestamp, result, HTTP status code if available, duration, failure category, and a safe diagnostic summary.  
**FR-UP-03 (P0):** Apply a configurable timeout and bounded redirect count.  
**FR-UP-04 (P0):** Do not open an incident based on a single transient failure by default. Require configurable consecutive failures or a confirmation check.  
**FR-UP-05 (P0):** Resolve an open downtime incident after successful recovery checks.  
**FR-UP-06 (P0):** Calculate uptime for reports from stored check history and clearly document the calculation method.  
**FR-UP-07 (P0):** Distinguish site status as `up`, `degraded`, `down`, `unknown`, or `paused`.  
**FR-UP-08 (P0):** Avoid treating HTTP 4xx responses identically to transport failure. Provide configurable expected status policy, with 5xx and connection failures treated as failures by default.  
**FR-UP-09 (P1):** Support optional expected status codes and per-site timeout settings.  
**FR-UP-10 (P0):** Prevent overlapping checks for the same site when a prior check is still running.

### 4.5 SSL certificate monitoring

**FR-SSL-01 (P0):** For HTTPS sites, establish a TLS connection and inspect certificate validity.  
**FR-SSL-02 (P0):** Verify hostname match, certificate chain trust, and not-before/not-after dates.  
**FR-SSL-03 (P0):** Store the certificate expiry timestamp, last check time, and result.  
**FR-SSL-04 (P0):** Create alerts at configurable thresholds; defaults: 30, 14, 7, and 1 day before expiry.  
**FR-SSL-05 (P0):** Detect invalid, expired, mismatched, or untrusted certificates.  
**FR-SSL-06 (P0):** Do not claim SSL was checked successfully if the TLS handshake or certificate validation failed.

### 4.6 Domain expiry and DNS

**FR-DNS-01 (P0):** Extract the registrable domain using a maintained Public Suffix List library.  
**FR-DNS-02 (P0):** Query RDAP/registry sources for domain registration and expiry data when supported.  
**FR-DNS-03 (P0):** If expiry data is unavailable, display “Not available” and never invent an expiry date.  
**FR-DNS-04 (P1):** Record DNS A/AAAA/CNAME/MX/NS results as applicable and optionally detect changes.  
**FR-DNS-05 (P0):** Schedule domain and DNS checks separately from uptime checks to control request volume.  
**FR-DNS-06 (P0):** Show the source and timestamp of the latest domain expiry result.

### 4.7 Broken-link and technical audit crawler

**FR-CRAWL-01 (P0):** Crawl same-origin pages from a configured starting URL, subject to limits.  
**FR-CRAWL-02 (P0):** Check internal and external links discovered on crawled pages.  
**FR-CRAWL-03 (P0):** Record source page, target URL, status/result, link type, and detection timestamp.  
**FR-CRAWL-04 (P0):** Deduplicate normalized URLs and prevent crawl loops.  
**FR-CRAWL-05 (P0):** Respect per-site page limits, total request limits, maximum depth, request timeout, and per-host concurrency.  
**FR-CRAWL-06 (P0):** Use a polite, configurable request rate and identify the crawler with a clear user agent. Respect robots.txt by default for crawling pages; provide clear settings and documentation.  
**FR-CRAWL-07 (P0):** Handle redirects with a bounded redirect count and detect redirect loops.  
**FR-CRAWL-08 (P0):** Treat 429, network timeouts, bot challenges, and certain 403 responses as potentially inconclusive rather than automatically classifying every target as broken.  
**FR-CRAWL-09 (P0):** Support basic HTML parsing without a headless browser by default. JavaScript-rendered sites may have incomplete crawl coverage; disclose this limitation.  
**FR-CRAWL-10 (P0):** Schedule audits weekly for Starter and according to plan policy for higher plans. Final limits must be configurable server-side.  
**FR-CRAWL-11 (P0):** Run crawl jobs asynchronously and allow the user to see queued, running, completed, partial, or failed status.  
**FR-CRAWL-12 (P0):** Avoid storing full page content; store only required metadata and findings.  
**FR-CRAWL-13 (P0):** Allow an authorized user to rerun an audit manually within plan limits.  
**FR-CRAWL-14 (P1):** Detect redirect chains and identify links with excessive redirects.  
**FR-CRAWL-15 (P1):** Add optional sitemap discovery and sitemap-based crawling.

### 4.8 Basic technical SEO checks

**FR-SEO-01 (P0):** Check for missing or empty title tags.  
**FR-SEO-02 (P0):** Check for missing or empty meta descriptions.  
**FR-SEO-03 (P0):** Check for missing canonical tags and obvious malformed canonical URLs.  
**FR-SEO-04 (P0):** Check for missing H1 tags and multiple H1 tags as an advisory finding, not necessarily an error.  
**FR-SEO-05 (P0):** Check robots.txt and sitemap.xml accessibility when applicable.  
**FR-SEO-06 (P0):** Store findings with severity, page URL, short explanation, and detected timestamp.  
**FR-SEO-07 (P0):** Do not present basic technical checks as a complete SEO audit or promise ranking improvements.

### 4.9 Incident management

**FR-INC-01 (P0):** Create incidents for confirmed downtime, SSL problems/expiry thresholds, and selected high-priority findings.  
**FR-INC-02 (P0):** Incident states: `open`, `acknowledged`, `resolved`, and `muted`.  
**FR-INC-03 (P0):** Store first detected, last detected, resolved time, severity, source monitor, and summary.  
**FR-INC-04 (P0):** Group repeated events into the same incident when appropriate instead of creating a new incident for every failed check.  
**FR-INC-05 (P0):** Allow authorized users to acknowledge, mute, and add internal notes to incidents.  
**FR-INC-06 (P0):** Keep an audit trail for state changes.  
**FR-INC-07 (P1):** Add maintenance windows and scheduled mute periods.

### 4.10 Notifications

**FR-NOT-01 (P0):** Send email notifications for confirmed downtime, recovery, and SSL/domain expiry thresholds.  
**FR-NOT-02 (P0):** Allow per-workspace notification settings and per-site overrides where appropriate.  
**FR-NOT-03 (P0):** Deduplicate repeated notifications and apply cooldowns.  
**FR-NOT-04 (P0):** Queue notifications for retry on temporary provider errors.  
**FR-NOT-05 (P0):** Do not send a separate email for every failed check while an incident remains open.  
**FR-NOT-06 (P1):** Add optional Slack/webhook integrations in a future release.

### 4.11 Monthly reports and white-label

**FR-REP-01 (P0):** Generate a monthly report per website or per client containing multiple websites.  
**FR-REP-02 (P0):** Report period is explicit and uses a consistent timezone.  
**FR-REP-03 (P0):** Include uptime percentage, total confirmed downtime, incidents, response-time summary, SSL status, latest audit findings, and unresolved issues.  
**FR-REP-04 (P0):** Include comparison with the previous period only where enough valid data exists.  
**FR-REP-05 (P0):** Include data freshness timestamps and disclose incomplete monitoring/audit coverage.  
**FR-REP-06 (P0):** Support agency logo, agency name, brand colors, and footer/contact details.  
**FR-REP-07 (P0):** Generate PDF using a controlled HTML-to-PDF process.  
**FR-REP-08 (P0):** Allow on-demand generation and scheduled monthly email delivery.  
**FR-REP-09 (P0):** Provide private, revocable, hard-to-guess report links with expiration or revocation controls.  
**FR-REP-10 (P0):** Do not expose internal notes, credentials, or sensitive diagnostics in customer-facing reports.  
**FR-REP-11 (P0):** If no reportable data exists, explain the gap instead of fabricating metrics.  
**FR-REP-12 (P0):** Weekly reports are out of scope for v1.  
**FR-REP-13 (P1):** Support custom report domain and complete product-brand removal in the Pro plan.

### 4.12 Billing and plan enforcement

**FR-BILL-01 (P0):** Integrate Paddle subscriptions and process webhooks idempotently.  
**FR-BILL-02 (P0):** Plans are configuration-driven, not hardcoded across UI components.  
**FR-BILL-03 (P0):** Enforce site limits server-side for create, import, and reactivate operations.  
**FR-BILL-04 (P0):** Enforce crawl budgets, audit frequency, report branding, and team-member limits server-side.  
**FR-BILL-05 (P0):** Define grace-period behavior for failed payments and canceled subscriptions.  
**FR-BILL-06 (P0):** Existing data remains readable if a subscription lapses, while new monitoring/actions follow documented grace and downgrade rules.  
**FR-BILL-07 (P0):** Provide billing status and a link to customer billing management.  
**FR-BILL-08 (P0):** Verify webhook signatures and handle duplicate/out-of-order events safely.

### 4.13 Internal operations and support

**FR-OPS-01 (P0):** Log worker starts, job outcomes, retries, and unexpected exceptions.  
**FR-OPS-02 (P0):** Provide health checks for the web application and worker process.  
**FR-OPS-03 (P0):** Expose internal metrics for queue depth, job age, check latency, error rate, and email delivery failures.  
**FR-OPS-04 (P0):** Add a safe mechanism to retry or requeue failed jobs.  
**FR-OPS-05 (P0):** Never log passwords, API secrets, session tokens, full authorization headers, or private report tokens.  
**FR-OPS-06 (P1):** Add an internal support view for investigating a workspace, with access auditing.

---

## 5. Proposed Pricing and Plan Limits

Pricing is a hypothesis to validate with agencies. All limits must be stored in server-side plan configuration and can be changed without schema changes.

| Feature | Agency Starter | Agency Growth | Agency Pro |
|---|---:|---:|---:|
| Price/month | US$49 | US$99 | US$199 |
| Price/year (2 months free) | US$490 | US$990 | US$1,990 |
| Active websites | 15 | 50 | 150 |
| Uptime interval | 5 minutes | 2 minutes | 1 minute |
| Basic SSL monitoring | Yes | Yes | Yes |
| Domain expiry data | When available | When available | When available |
| Link/SEO audits | Weekly | Weekly | Weekly |
| Monthly PDF reports | Yes | Yes | Yes |
| Agency branding | Logo and basic branding | Full standard branding | Advanced white-label |
| Shareable report links | Yes | Yes | Yes |
| Team members | 1 | Up to 3 | Up to 10 |
| Monthly email automation | Yes | Yes | Yes |
| Audit budget | Limited | Higher | Highest |
| Custom report domain | No | No | P1 / planned |

Important:
- The uptime intervals were load-tested before launch (`docs/load-test.md`); re-test on production hardware.
- Pro audits are weekly, not every 3 days: a full Pro workspace crawling every 3 days could use most of one worker's audit capacity.
- Above Pro's 150 websites there is no paid add-on; agencies that need more contact us.
- The trial is 14 days with Growth limits; no card needed.
- The number of pages crawled per audit must be limited per plan and configurable.
- Do not advertise “unlimited” checks or crawls.
- Avoid including a third-party paid performance API in the base plan until its cost is understood.
- Do not guarantee domain expiry coverage for every TLD.

---

## 6. Technical Architecture

### 6.1 Stack

- **Web app:** Next.js, TypeScript, App Router.
- **UI:** Tailwind CSS and a consistent component system.
- **Database:** Neon PostgreSQL.
- **ORM:** Prisma.
- **Authentication:** Auth.js or another well-supported Next.js-compatible solution; choose one during implementation and do not build custom password/session cryptography.
- **Worker runtime:** Node.js + TypeScript, in the same repository as the web app but running as a separate process.
- **Hosting:** Hetzner for the web app and worker processes.
- **Email:** Resend.
- **Billing:** Paddle.
- **PDF:** HTML template rendered by a controlled headless browser process, e.g. Playwright.
- **Object storage:** Cloudflare R2 only when persistent PDF/file storage is needed.
- **Scheduling:** Persistent PostgreSQL-backed jobs and a scheduler in v1. Redis/BullMQ may be introduced later if justified by load and queue requirements.

### 6.2 High-level flow

1. The web app creates a site and stores its monitor configuration.
2. The scheduler creates due jobs in persistent storage.
3. The worker claims jobs safely, runs checks, and writes results.
4. The incident engine evaluates consecutive failures, recovery, and alert thresholds.
5. The notification system queues deduplicated email messages.
6. Monthly report jobs aggregate historical results and render PDFs.
7. The web app displays current status, findings, incident history, and report links.

### 6.3 Repository structure

Suggested monorepo:

```text
apps/
  web/                  # Next.js app
  worker/               # Persistent TypeScript worker process
packages/
  db/                   # Prisma schema, migrations, database client
  shared/               # Shared types, schemas, plan config
  monitoring/           # HTTP, TLS, DNS check implementations
  crawler/              # URL normalization, crawl policy, HTML parsing
  reports/              # Report data aggregation and templates
  config/               # Typed environment configuration
```

The exact monorepo tooling (npm workspaces, pnpm, or Turborepo) can be chosen during setup. Do not introduce extra tooling unless it helps the implementation.

### 6.4 Job processing

Each job must have:
- Job type and target resource.
- Scheduled time.
- Status (`pending`, `running`, `completed`, `failed`, `cancelled`).
- Attempt count and next retry time.
- Lock/lease timestamp and worker identifier.
- Created, started, completed, and updated timestamps.
- Sanitized error category/message.

Requirements:
- Claim jobs atomically using database transactions/locking.
- Recover jobs with expired leases.
- Apply exponential backoff with a maximum attempt count.
- Use idempotency keys or unique constraints to prevent duplicate side effects.
- Apply per-workspace and per-host concurrency limits.
- Keep job execution separate from web request lifecycle.

Do not rely on serverless request handlers for long-running crawls or recurring checks.

---

## 7. Data Model

The following is a conceptual model. Exact Prisma fields and indexes should be finalized during implementation.

### 7.1 Core entities

**User**
- id
- name
- email
- auth provider/password hash handled by selected auth system
- createdAt
- updatedAt

**Workspace**
- id
- name
- slug
- timezone
- logoUrl
- brandPrimaryColor
- brandSecondaryColor
- reportFooter
- createdAt
- updatedAt

**WorkspaceMember**
- id
- workspaceId
- userId
- role (`owner`, `admin`, `member`)
- createdAt

**Client**
- id
- workspaceId
- name
- contactName (optional)
- contactEmail (optional)
- notes (optional, internal)
- status (`active`, `archived`)
- createdAt
- updatedAt

**Site**
- id
- workspaceId
- clientId (nullable)
- name
- baseUrl
- normalizedHostname
- status (`active`, `paused`, `archived`)
- expectedStatusPolicy
- checkIntervalSeconds
- timeoutMs
- crawlConfig JSON
- createdAt
- updatedAt
- archivedAt (nullable)

**MonitorCheck**
- id
- workspaceId
- siteId
- checkType (`uptime`, `ssl`, `dns`, `domain`)
- status (`success`, `failure`, `inconclusive`)
- checkedAt
- durationMs (nullable)
- httpStatusCode (nullable)
- failureCategory (nullable)
- summary (sanitized)
- metadata JSON (strictly allowlisted)
- createdAt

**AuditRun**
- id
- workspaceId
- siteId
- type (`links`, `technical_seo`)
- status (`queued`, `running`, `completed`, `partial`, `failed`, `cancelled`)
- startedAt (nullable)
- completedAt (nullable)
- pagesVisited
- linksChecked
- findingsCount
- errorSummary (nullable)
- createdAt

**AuditFinding**
- id
- workspaceId
- siteId
- auditRunId
- type (`broken_link`, `redirect_chain`, `missing_title`, `missing_meta_description`, `missing_canonical`, `missing_h1`, `robots_unavailable`, `sitemap_unavailable`, etc.)
- severity (`info`, `low`, `medium`, `high`)
- sourceUrl (nullable)
- targetUrl (nullable)
- statusCode (nullable)
- summary
- firstSeenAt
- lastSeenAt
- resolvedAt (nullable)
- createdAt
- updatedAt

**Incident**
- id
- workspaceId
- siteId
- type (`downtime`, `ssl_expiry`, `ssl_invalid`, `domain_expiry`, `audit_issue`, `dns_change`)
- severity (`low`, `medium`, `high`, `critical`)
- status (`open`, `acknowledged`, `resolved`, `muted`)
- title
- summary
- firstDetectedAt
- lastDetectedAt
- resolvedAt (nullable)
- createdAt
- updatedAt

**IncidentEvent**
- id
- workspaceId
- incidentId
- actorUserId (nullable for system events)
- eventType
- note (nullable)
- createdAt

**NotificationPreference**
- id
- workspaceId
- userId (nullable)
- siteId (nullable)
- eventType
- enabled
- cooldownMinutes
- createdAt
- updatedAt

**EmailDelivery**
- id
- workspaceId
- recipient
- templateType
- deduplicationKey
- status (`pending`, `sent`, `failed`)
- attempts
- providerMessageId (nullable)
- lastError (sanitized, nullable)
- scheduledAt
- sentAt (nullable)
- createdAt
- updatedAt

**MonthlyReport**
- id
- workspaceId
- clientId (nullable)
- siteId (nullable)
- periodStart
- periodEnd
- status (`queued`, `generating`, `ready`, `failed`, `revoked`)
- storageKey (nullable)
- privateTokenHash (nullable)
- expiresAt (nullable)
- generatedAt (nullable)
- createdAt
- updatedAt

**Subscription**
- id
- workspaceId
- provider (`paddle`)
- providerCustomerId
- providerSubscriptionId
- planKey
- status
- currentPeriodStart
- currentPeriodEnd
- createdAt
- updatedAt

**Job**
- id
- workspaceId (nullable for system jobs)
- jobType
- resourceType
- resourceId
- payload JSON (validated; no secrets)
- status
- priority
- runAt
- attempts
- maxAttempts
- lockedAt (nullable)
- lockedBy (nullable)
- lastError (sanitized, nullable)
- idempotencyKey (unique where appropriate)
- createdAt
- updatedAt

**AuditLog**
- id
- workspaceId
- actorUserId (nullable)
- action
- resourceType
- resourceId
- metadata JSON (allowlisted)
- createdAt

### 7.2 Data modeling requirements

- Add indexes for workspaceId, siteId, checkedAt, status, runAt, and common dashboard filters.
- Use composite unique constraints where appropriate, including membership and deduplication keys.
- Ensure every workspace-owned query includes workspace authorization.
- Avoid storing full HTML bodies, credentials, arbitrary response headers, or unbounded error text.
- Define retention policies for raw checks and detailed audit findings before launch.
- Consider partitioning or periodic aggregation only after real volume justifies it.
- Store timestamps in UTC and use workspace timezone for report boundaries and scheduled email delivery.

---

## 8. Security and Abuse Prevention

### 8.1 SSRF prevention — mandatory

The crawler and URL checker make outbound requests based on user-supplied URLs. They must not be usable to reach internal services.

- Allow only `http` and `https`.
- Reject URLs containing credentials.
- Resolve hostnames and block loopback, private, link-local, multicast, reserved, and cloud metadata IP ranges for IPv4 and IPv6.
- Revalidate every redirect destination, not only the initial URL.
- Prevent DNS rebinding where practical by validating resolved addresses at connection time or using a hardened outbound-fetch layer.
- Block access to localhost, private network ranges, internal hostnames, and metadata endpoints.
- Limit redirects, response bytes, connection duration, and total job runtime.
- Apply per-host and per-workspace concurrency/rate limits.
- Do not let users specify arbitrary headers or request methods in v1.
- Never fetch arbitrary file schemes or non-HTTP protocols.

### 8.2 Application security

- Enforce workspace authorization on every server operation.
- Validate all external input with typed schemas.
- Rate-limit login, report-token access, manual audits, CSV imports, and expensive operations.
- Verify Paddle webhook signatures and make processing idempotent.
- Store secrets in environment variables or a secrets manager, never in source control.
- Use secure session cookies and CSRF protections as appropriate to the selected auth implementation.
- Keep dependencies updated and run dependency/security checks in CI.
- Escape user-supplied content in reports and UI.
- Never expose internal notes in customer-facing reports.
- Store only a hash of private report tokens; support revocation and expiry.
- Redact sensitive data from logs.

### 8.3 Privacy and retention

- Provide account/workspace deletion workflows with clear effects.
- Define retention for check history, audit findings, reports, and logs.
- Do not store full web page bodies unless a later feature explicitly requires it.
- Document that crawler coverage can be incomplete on JavaScript-heavy or bot-protected sites.

---

## 9. UX and Information Architecture

### 9.1 Primary navigation

- Overview
- Websites
- Clients
- Incidents
- Reports
- Team (when enabled)
- Settings
- Billing

### 9.2 Overview dashboard

Show:
- Total active sites and sites at risk.
- Current uptime state distribution.
- Open critical/high incidents.
- SSL/domain expiry alerts.
- Recent audit findings.
- Latest completed monthly reports.
- Filters for client, status, and issue severity.

The dashboard must prioritize actions over decorative charts. Empty states should guide the user to add a first client/site.

### 9.3 Websites list

Columns:
- Website/name
- Client
- Current status
- Uptime over selected period
- Response time
- SSL status/expiry
- Open incidents
- Last audit
- Last checked

Support search, filters, sorting, pagination, and bulk pause/resume where safe.

### 9.4 Website detail

Tabs or sections:
- Summary
- Uptime history
- SSL and domain
- Audit findings
- Incidents
- Reports
- Settings

Show timestamps and freshness labels. Never imply a current status if the last check is stale; use `unknown` or a stale indicator.

### 9.5 Client detail

- Client overview and contact details.
- Assigned sites.
- Current issues across the client's sites.
- Report history.
- Generate/send monthly report action.

### 9.6 Report experience

- Preview report data before sending.
- Show missing data or incomplete audit coverage.
- Confirm recipients before first automatic delivery.
- Allow manual generation and resend.
- Allow revoking a shared report link.

### 9.7 Design direction

- Professional, calm, agency-oriented B2B interface.
- Light theme first; accessible contrast and clear severity semantics.
- Avoid generic AI-dashboard aesthetics: avoid excessive gradients, decorative charts, giant empty cards, and redundant metrics.
- Use compact but readable tables and clear issue lists.
- Reserve strong colors for status/severity, not decoration.
- Design report PDFs as polished client deliverables with typography, whitespace, concise summaries, and actionable findings.

---

## 10. Uptime and Audit Logic

### 10.1 Uptime calculation

Define uptime as successful eligible checks divided by all eligible completed checks in the selected period. Document treatment of inconclusive checks and missing monitoring coverage. Do not silently count missing checks as successful.

Show:
- Percentage.
- Number of checks.
- Confirmed downtime duration, where estimable.
- Data coverage percentage or a clear warning if coverage is incomplete.

A check-based percentage is not the same as independently measured real-world availability; label it accordingly.

### 10.2 Incident confirmation

- Use at least two consecutive failed checks or an explicit confirmation check before opening a normal downtime incident.
- Critical cases may use faster confirmation, but must be configurable.
- Use recovery confirmation to avoid flapping.
- Deduplicate incidents by site and type.
- Keep check records even when they do not trigger an incident.

### 10.3 Broken link classification

Classify outcomes carefully:
- Confirmed broken: stable 404/410 or clearly invalid destination after bounded retries.
- Redirect issue: loop or excessive redirect chain.
- Inconclusive: timeout, 429, bot challenge, certain 403 responses, or temporary network failures.
- Valid: successful response or acceptable redirect outcome.

A failed external link must not automatically be treated as a confirmed broken link from one request.

### 10.4 Crawl limits

Initial suggested defaults, subject to load testing:
- Maximum 500 internal pages per audit on Starter.
- Higher bounded page budgets on Growth and Pro.
- Maximum crawl depth and total request count.
- Per-host concurrency of 1–2 requests initially.
- Request timeout around 10 seconds, configurable within a safe range.
- Bounded response size and redirect count.
- Per-site cooldown between full crawls.
- Stop jobs that exceed maximum runtime.

These are implementation starting points, not promises to customers. Make budgets configurable by plan.

---

## 11. Monthly Reporting Specification

Each report should include:

1. Agency branding and report period.
2. Executive summary in plain language.
3. Site(s) included and coverage notes.
4. Uptime percentage and confirmed incidents.
5. Response-time summary and trend where enough data exists.
6. SSL status and expiry date where available.
7. Domain expiry status when supported by registry data.
8. Most recent broken-link and technical SEO findings.
9. Open issues and recommended next actions.
10. Previous-month comparison where valid data exists.
11. Report generation timestamp and source-data freshness.

Rules:
- The monthly report summarizes the period, not just the latest check.
- Audit findings must include their audit timestamp.
- Do not imply every broken link existed throughout the entire month if only a final audit was performed.
- Clearly distinguish resolved incidents from outstanding issues.
- Do not invent data or display misleading precision.
- Allow report delivery to be scheduled by workspace timezone.
- Weekly reports are explicitly excluded from v1.

---

## 12. Non-Functional Requirements

### Performance
- Dashboard pages should load quickly for a workspace with hundreds of sites using pagination and indexed queries.
- Do not perform crawls or PDF rendering in synchronous web requests.
- Use background jobs for expensive tasks.
- Set request timeouts and database query limits.

### Reliability
- Jobs must survive process restarts.
- Expired job locks must be recoverable.
- Retries must be bounded and idempotent.
- Monitoring failures must not block unrelated sites.
- A worker outage must be observable through health checks and job-age metrics.

### Scalability
- Scale web and worker processes independently.
- Apply plan-aware concurrency and crawl budgets.
- Keep raw monitoring data and aggregated reporting data separable.
- Add Redis/BullMQ only when operational evidence warrants it.

### Accessibility
- Aim for WCAG 2.2 AA for primary flows.
- Ensure keyboard navigation, visible focus, form labels, and non-color-only status indicators.

### Localization
- Launch with English UI and report copy if targeting international agencies.
- Use locale-aware date, number, and timezone formatting.
- Keep user-facing strings centralized for later localization.

---

## 13. Testing Strategy

### Unit tests
- URL normalization and validation.
- Public/private IP classification.
- Redirect validation and SSRF guards.
- Uptime result classification.
- SSL expiry thresholds.
- Domain/RDAP response parsing.
- Broken-link outcome classification.
- Uptime aggregation and report-period boundaries.
- Plan-limit enforcement.
- Report token generation, hashing, expiration, and revocation.
- Paddle webhook idempotency.

### Integration tests
- Database tenant isolation.
- Job claiming, leases, retries, and recovery.
- Email deduplication.
- Incident open/acknowledge/resolve lifecycle.
- Monthly report aggregation and generation.
- CSV import validation.
- Subscription status updates from webhook events.

### End-to-end tests
- Sign up and create a workspace.
- Add a client and website.
- Run a manual check.
- View an incident and acknowledge it.
- Start an audit and inspect findings.
- Generate a monthly report and open its private link.
- Attempt to access another workspace's resources and confirm denial.
- Verify plan limits block over-limit sites and audits.

### Security tests
- SSRF attempts against localhost, private IPs, IPv6 local addresses, metadata endpoints, and redirects to blocked destinations.
- DNS rebinding scenarios where practical.
- Cross-tenant IDOR tests.
- Malformed URL and redirect-loop tests.
- Rate-limit tests.
- Report-token brute-force resistance.
- Webhook signature and replay/idempotency tests.

---

## 14. Acceptance Criteria for v1

The MVP is ready for private beta when:

1. An agency can create an account and workspace.
2. The agency can create clients and add multiple websites.
3. The app enforces plan site limits server-side.
4. Active websites are checked at the configured cadence by a persistent worker.
5. SSL certificate checks validate hostname and trust, and produce expiry alerts.
6. Domain expiry is displayed only when sourced reliably; unavailable data is clearly labeled.
7. A controlled crawler can audit internal pages and discovered links within defined budgets.
8. Basic technical SEO findings are stored and viewable.
9. Confirmed failures create incidents, repeated failures are deduplicated, and recovery resolves incidents.
10. Email alerts are delivered with deduplication and cooldowns.
11. A monthly report can be generated with agency branding and accurate period-based metrics.
12. Monthly report delivery can be scheduled.
13. Private report links can expire and be revoked.
14. Workspace data is isolated and SSRF protections pass security tests.
15. Jobs recover from worker restarts without silently losing scheduled work.
16. Billing webhooks update subscription state idempotently.
17. Monitoring gaps and incomplete audits are clearly represented.
18. Core user flows have automated tests.

---

## 15. Implementation Phases

### Phase 0 — Foundation
- Set up repository, linting, formatting, type checks, CI, and environment validation.
- Configure Next.js, Prisma, Neon, and authentication.
- Create workspace and tenant-authorization helpers.
- Add baseline logging and error handling.

### Phase 1 — Agency and site management
- Clients, websites, site status, CSV import, plan configuration.
- Initial dashboard and website details.
- Server-side site limits.

### Phase 2 — Monitoring engine
- Persistent jobs and scheduler.
- Uptime checks and result history.
- SSL checks and expiry alerts.
- DNS/domain checks where data is available.
- Incident lifecycle and recovery.

### Phase 3 — Technical audits
- Safe URL-fetch layer.
- Bounded crawler.
- Internal/external link checks.
- Basic SEO checks.
- Audit UI, findings, and manual rerun.

### Phase 4 — Notifications and reporting
- Email delivery queue and deduplication.
- Monthly report aggregation.
- Branded PDF generation.
- Private share links.
- Scheduled monthly delivery.

### Phase 5 — Billing and beta hardening
- Paddle checkout and webhooks.
- Plan limit enforcement for all costly features.
- Tenant-isolation and SSRF security tests.
- Worker health monitoring and operational dashboards.
- Load tests for plan-level site/crawl assumptions.
- Private beta with a small group of agencies.

### Phase 6 — Post-launch validation
Prioritize based on real usage:
- Team invitations and role permissions if not included in beta.
- Custom report domains.
- Slack/webhook notifications.
- Visual monitoring or performance integrations only if customer demand and economics justify them.

---

## 16. Product Metrics

Track:
- Number of activated workspaces.
- Time from signup to first website monitored.
- Percentage of workspaces with at least one client and one site.
- Weekly active workspaces.
- Number of active sites per workspace.
- Successful check coverage and worker job latency.
- Confirmed incident detection and false-positive rate.
- Audit completion rate and average crawl cost.
- Monthly report generation and delivery rate.
- Percentage of reports opened/shared, where measurable with privacy-conscious tracking.
- Trial-to-paid conversion, churn, and expansion between plans.
- Infrastructure and email cost per active site/workspace.

Avoid optimizing only for number of checks. Prioritize reliable detections, successful reports, and ongoing agency usage.

---

## 17. Open Decisions to Resolve Before Public Launch

1. Final authentication provider and exact team permissions.
2. Final crawl page budgets and audit frequencies per plan after load testing.
3. Retention periods for detailed checks and findings.
4. Whether the Pro custom report domain ships at launch or is deferred.
5. Exact grace-period and downgrade rules for failed/canceled subscriptions.
6. Whether monthly reports are sent automatically by default or require explicit opt-in per client.
7. Whether any third-party performance audit (such as Lighthouse/PageSpeed) is included; do not include it until cost and rate limits are understood.
8. Final pricing after interviews and pilot usage with agencies.

---

## 18. Final Product Decision

Build an agency-first website health monitoring SaaS with:

- Next.js + TypeScript.
- Neon PostgreSQL + Prisma.
- Separate persistent Node.js/TypeScript worker.
- Hetzner hosting.
- Resend for email.
- Paddle for subscriptions.
- Monthly reports only in v1.
- Three proposed plans: US$49, US$99, and US$149 per month.
- Uptime, SSL, domain/DNS data where available, broken-link crawling, basic technical SEO, incident management, and branded client reporting.
- No Python, Redis, Celery, or BullMQ in the initial release unless concrete operational evidence justifies introducing them.

The launch goal is not to ship the largest feature set. It is to deliver reliable monitoring, useful incident notifications, and professional monthly reporting that agencies can use across their client portfolios.
