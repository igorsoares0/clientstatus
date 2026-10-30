# Client Status

Website health monitoring and white-label monthly reports for agencies. Product spec:
[`docs/Spec-Driven-Development.md`](docs/Spec-Driven-Development.md) (source of truth). Design handoff:
[`docs/design_handoff_client_status/`](docs/design_handoff_client_status/README.md).

**Status:** Phases 0–5. Foundation, auth, onboarding, clients and websites, monitoring (uptime, SSL, domain
expiry, incidents), technical audits (bounded crawler, broken links, basic SEO), email alerts, branded monthly reports
(PDF, private links, scheduled delivery), Paddle billing with plan enforcement, security tests, an internal ops
dashboard and load tests are done. There is no private beta: the launch is public with open sign-up
([`docs/launch.md`](docs/launch.md)). Phase 6 (post-launch) waits for real usage and paying customers.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon in production) · Prisma 7 ·
Better Auth (email + password) · Resend · a separate Node worker process.

## Local setup

Requires Node 24 and Docker.

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET: openssl rand -base64 32
npm install                       # also generates the Prisma client
npm run db:up                     # Postgres 17 on localhost:5435 (+ clientstatus_test database)
npm run db:migrate
npm run dev                       # web app on http://localhost:3000
npm run worker                    # checks + job queue; health and queue metrics on http://localhost:3001/health
npx playwright install chromium   # PDF reports are rendered with headless Chromium (use --with-deps on servers)
```

Generated PDFs and uploaded logos are stored on local disk under `STORAGE_DIR` (default `./storage`). In production
the worker and the web app must share that directory.

In development, emails are not sent. They are printed to the terminal and appended to `.dev-mailbox/emails.jsonl`,
including the verification and password-reset links. Set `EMAIL_DELIVERY=resend` and `RESEND_API_KEY` to send real
emails, and point a Resend webhook (`email.bounced`, `email.complained`) at `/api/webhooks/resend` with its signing
secret in `RESEND_WEBHOOK_SECRET`.

## Deploy (Docker / Coolify)

`Dockerfile` builds two targets from the same code: `web` (Next.js standalone server, port 3000) and `worker`
(background worker with headless Chromium for PDFs, health on 3001). `docker-compose.prod.yml` runs them in the order
from [`docs/launch.md`](docs/launch.md): a one-off `migrate` service (`prisma migrate deploy`), then the worker, then
the web app once the worker is healthy. Both mount the `storage` volume at `/data/storage`, so they share one host.

On Coolify: new resource → Docker Compose → this repository, compose file `docker-compose.prod.yml`. Give only `web` a
domain (port 3000), never the worker. Set the variables once for the stack; `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` and `LEGAL_NAME` are required (`SUPPORT_EMAIL` is
the contact on `/bot` and the legal pages, `LEGAL_NAME` the seller named on them). `TRUSTED_PROXY_HOPS` defaults to 1 for Coolify's proxy; with Cloudflare in front, set
`CLIENT_IP_HEADER=cf-connecting-ip`. Back up the `storage` volume along with the database.

`/bot` is the public page the crawler's User-Agent links to (`lib/monitoring/safe-fetch.ts`): what it requests, how to
opt out via robots.txt, and whom to contact.

`/terms`, `/privacy` and `/refunds` are public (Paddle's domain review needs them). Shared facts — last-updated date,
refund window, notice period and the list of service providers — live in `lib/legal.ts`; retention, trial and grace
numbers are read from the code that enforces them. Update `SUBPROCESSORS` if the database moves off Hetzner (e.g. Neon).

`/` is the public landing page (`app/page.tsx`, pieces in `components/landing.tsx`); `proxy.ts` sends visitors with a
session cookie to `/overview`. Prices come from `lib/plans.ts`. The report images in `public/landing/` are screenshots
of the real renderer with fictional data: re-create them with `npm run landing:images` after changing the report design.

## Checks

```bash
npm run lint && npm run typecheck && npm test   # unit + integration (uses TEST_DATABASE_URL)
npm run test:e2e                                # builds and runs on :3100 against the test database
npm run load-test -- --workspaces 5 --plan pro   # worker throughput vs plan intervals (own local database)
```

Security tests (spec §13) live in `tests/unit/security.test.ts` (SSRF inputs, IP classification, rate limits, token
strength), `tests/integration/ssrf.test.ts` (DNS rebinding, hostile redirects), `tests/integration/isolation.test.ts`
(every data function against another workspace's ids), `tests/integration/rate-limit.test.ts` (shared counters under
concurrency) and `tests/e2e/billing.spec.ts` (webhook signatures, cross-tenant pages). Load-test results: [`docs/load-test.md`](docs/load-test.md).

## Layout

| Path              | What                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `app/(auth)/`     | Sign up, verify email, sign in, password reset                                          |
| `app/onboarding/` | Workspace creation                                                                      |
| `app/(app)/`      | Signed-in shell: sidebar, status bar, one folder per section                            |
| `lib/session.ts`  | Data Access Layer entry: `requireUser()`, `requireMembership()`                         |
| `lib/data/`       | Workspace-scoped queries; every one takes a `TenantContext`                             |
| `lib/plans.ts`    | Plan prices and limits, the single source for UI and enforcement                        |
| `lib/url.ts`      | URL normalization and input-time blocking of private/local addresses                    |
| `components/ui/`  | Design-system primitives (buttons, fields, status glyphs, severity meter, toast, icons) |
| `worker/`         | Background worker: scheduler, Postgres job queue, checks, audits, emails, reports       |
| `lib/notify/`     | Alert settings, email templates, incident alerts and reminders                          |
| `lib/reports/`    | Monthly report aggregation, HTML/PDF rendering, scheduling, sending and private links   |
| `lib/billing/`    | Paddle client and webhook verification, subscription state, grace and access rules      |
| `lib/ops/`        | Internal metrics for `/ops` and the worker's `/metrics`                                 |
| `prisma/`         | Schema and migrations                                                                   |

Authorization rule: `proxy.ts` only checks that a session cookie exists. Every page and action must go through
`requireMembership()` and pass its context to `lib/data/*`, never a workspace id from the client.

## Monitoring rules

- Uptime: incidents open after 2 consecutive failed checks and resolve after 2 consecutive passes. Timeouts, HTTP 429
  and bot challenges are inconclusive: recorded, excluded from uptime, never alerting. Two slow responses (≥ 3 s to
  headers) in a row show a site as Degraded.
- SSL: checked every 6 hours (00/06/12/18 UTC + jitter). Invalid/expired certificates open `ssl_invalid`; expiry opens
  `ssl_expiry` at 30 days and escalates at 14, 7 and 1.
- Domain: RDAP once a day around 02:00 UTC. Where the registry doesn't publish an expiry date it shows "n/a" — never an
  estimate.
- A result older than two check intervals is shown as Stale with its last-known value.
- Raw checks are kept for 90 days (`RETENTION_DAYS` in `lib/monitoring/scheduler.ts`).

## Audit rules

- Same-site pages are crawled breadth-first within the plan's page, depth, request and time budgets (`lib/plans.ts`),
  ~1 request/s per host, honouring robots.txt (and its crawl-delay) unless the site setting turns it off. Hitting a
  budget, an empty JavaScript app shell, or an unreachable robots.txt makes the audit **partial**, with the reason shown.
- Links are broken only if they fail the same way twice (404/410, dead domain, refused connection, or the site's own
  5xx). 429s, bot challenges, 401/403, timeouts and other sites' 5xx are inconclusive and never counted.
- Findings keep their first-found date across audits. Only a complete audit resolves findings it no longer sees.
- Confirmed broken internal links open an `audit_issue` incident; it resolves when a complete audit finds none.
- Scheduled audits run around 03:00 UTC every `auditEveryDays`; manual reruns are limited per workspace per week.

## Alert rules

- Alerts go only to verified team members chosen in Settings → Alerts, never to clients. Each event (downtime, SSL
  invalid, SSL expiring, domain expiring) can be turned off for opened/resolved, and per website.
- One email per incident transition (opened, resolved, expiry threshold crossed), deduplicated per recipient.
  Unacknowledged downtime and invalid-SSL incidents repeat after the chosen interval (default 60 min; off is allowed).
  Acknowledging or muting stops repeats; muted incidents still send the recovery email.
- Inconclusive results and audit findings never send email.

## Report rules

- On the 1st of each month from 06:00 in the workspace time zone, one report per client with websites is generated for
  the previous month. Uptime excludes inconclusive and missing checks; gaps (partial coverage, late start, no audit,
  paused time) are disclosed in the report, never estimated.
- Default delivery is **hold for review**. With automatic delivery, a report is sent at 07:00 local only when it has no
  data gaps and every recipient was confirmed on an earlier delivery and hasn't bounced.
- Private links are 32 random bytes; only their SHA-256 hash identifies the report, so a link is shown once and can be
  rotated or revoked. Links expire after 30/60/90 days and are served with `noindex` and `no-referrer`.
- Queued report emails store a placeholder instead of the token. The token itself is sealed (AES-256-GCM, key derived
  from `BETTER_AUTH_SECRET`, bound to the report) until the worker sends the email, then cleared. Changing
  `BETTER_AUTH_SECRET` makes report emails still queued at that moment fail.
- Sending limits (`lib/reports/send.ts`), so the product can't be used to mass-mail arbitrary addresses: a workspace
  without a paid subscription queues at most 25 report emails per 24 hours; paid plans 10 × the plan's website limit
  (150 / 500 / 1,500), enough for the monthly run. The same person gets the same report at most twice per 24 hours.
  Over a limit, manual sends are refused with the reason and automatic sends wait for review.
- Previews (`lib/reports/schedule.ts`): one at a time per client and at most 3 rendering per workspace; 20 per 24 hours
  without a paid subscription, 100 with one. Monthly reports go ahead of previews and audits in the worker's long-job
  lane.

## Billing (Paddle)

- Plans, prices and limits live in `lib/plans.ts` (table in spec §5). Paddle has a monthly and a yearly USD price per
  plan: `PADDLE_PRICE_STARTER`/`GROWTH`/`PRO` and `PADDLE_PRICE_*_YEARLY`. The yearly three are optional but go
  together; without them checkout offers monthly only.
- **Setup (sandbox):** create an API key (Developer tools → Authentication) and a notification destination pointing
  at `https://<public-url>/api/webhooks/paddle` for `subscription.*` and `transaction.completed`, `transaction.paid`,
  `transaction.past_due`, `transaction.payment_failed`. Put the key and the destination's secret in `PADDLE_API_KEY` and
  `PADDLE_WEBHOOK_SECRET`. Locally, expose port 3000 with a tunnel (`cloudflared tunnel --url http://localhost:3000`).
  Sandbox test card: `4242 4242 4242 4242`, any future expiry, any CVC.
- **Checkout:** owners pick Monthly or Yearly ("2 months free") and a plan on Billing; Paddle's overlay checkout carries a signed workspace id in
  `custom_data`, so nobody can attach a subscription to another workspace. After payment the browser asks the server to
  confirm the transaction straight away; the webhook arrives too and is deduplicated.
- **Webhooks:** signature checked (HMAC-SHA256, 5-minute window), each `event_id` processed once, and entities older
  than what's stored (Paddle `updated_at`) ignored, so duplicates and out-of-order delivery are safe. A second live
  subscription never replaces the first (it is logged for a manual refund).
- **Plan changes:** in-app, prorated immediately, with a preview of the amount first (including any account credit
  Paddle applies). A change keeps the subscription's billing interval unless the owner switches it; the interval is
  stored on `subscription.billingInterval` from the webhook. Downgrades are refused until the active websites fit the
  smaller plan. There's no add-on above Pro: at its limit the app suggests contacting us (`SUPPORT_EMAIL`). Cancellation, payment method, billing details and invoices are in Paddle's
  customer portal.

### Grace and downgrade rules (FR-BILL-05/06)

| Situation                          | Monitoring, alerts, new reports  | Adding websites, checks, audits, sends |
| ---------------------------------- | -------------------------------- | -------------------------------------- |
| Trial (14 days, Growth limits)     | Yes                              | Yes, within limits                     |
| Paid and current                   | Yes                              | Yes, within limits                     |
| Payment failed                     | Yes, for 14 days from failure    | Yes, for 14 days                       |
| Cancelled                          | Until the end of the paid period | Until then                             |
| Trial ended / cancelled / paused   | **Stopped**                      | **Refused**, with the reason           |
| Over the limit after a plan change | Yes, nothing is stopped          | New websites refused until under limit |

Everything stays readable without an active plan; data is not deleted automatically. All of this reduces to one
column, `workspace.accessEndsAt` (`lib/billing/access.ts`); the scheduler, reminders, monthly reports and every
"start new work" action check it.

Plan-limited features, enforced on the server: active websites (create, import, resume, restore), uptime interval,
audit pages/depth/requests/time and frequency, manual audits per week, report branding (Starter: no custom footer,
reports end with "Prepared with Client Status"). Owners get one email per month when websites reach 90% of the plan.
Team members: limits are configured but there is no invitation flow yet (spec P1).

## Operations

- `/ops` (staff in `OPS_ADMIN_EMAILS` only, 404 for everyone else): workers, queue depth and oldest due job per type,
  check failure/inconclusive rate and latency, email failures, billing webhook outcomes, failed jobs with a safe
  **Requeue** (refused if the same work is already queued). Every ops action is logged with the staff email.
- Worker: `GET :3001/health` (liveness, for the process manager) and `GET :3001/metrics` (the same numbers as `/ops`,
  JSON). Keep port 3001 internal.

## Security hardening

- Security headers on every response (`next.config.ts`): `nosniff`, `frame-ancestors 'self'`, referrer policy,
  permissions policy, HSTS in production. Report routes add a stricter CSP.
- Rate limits: sign-in (per address+IP, per IP, and per address), sign-up per IP, password-reset and verification
  emails per address, report links per IP, and Better Auth's own limits on direct `/api/auth/*` calls. The counters
  are shared in Postgres (`rate_limit_bucket`: one atomic upsert per check, keys stored as SHA-256 hashes, expired
  windows pruned daily), so they hold across web instances.
- Quotas counted from the data (manual audits per week, CSV imports, report recipients, previews, report emails) are
  checked under a per-workspace lock, so concurrent requests can't overshoot them.
- Client address (`lib/rate-limit.ts`): read from the right of `X-Forwarded-For`, past `TRUSTED_PROXY_HOPS` proxies
  (default 1), or from `CLIENT_IP_HEADER` when the edge sets one. Better Auth reads only the resolved address, from a
  header the app sets itself. The web app must be reachable only through those proxies, or the address can be forged.
- Post-login redirects (`next`) only go to paths on this site (`safeNextPath` in `lib/validation.ts`).
- SSRF: IPv6 addresses are fully expanded before classification, so mapped (`::ffff:7f00:1`), NAT64, 6to4 and
  non-canonical loopback forms are blocked at input and again at connection time.
- CI runs `npm audit --omit=dev --audit-level=high`.
