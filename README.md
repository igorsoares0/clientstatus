# Client Status

Website health monitoring and white-label monthly reports for agencies. Product spec:
[`docs/Spec-Driven-Development.md`](docs/Spec-Driven-Development.md) (source of truth). Design handoff:
[`docs/design_handoff_client_status/`](docs/design_handoff_client_status/README.md).

**Status:** Phases 0–4. Foundation, auth, onboarding, clients and websites, monitoring (uptime, SSL, domain
expiry, incidents), technical audits (bounded crawler, broken links, basic SEO), email alerts and branded monthly
reports (PDF, private links, scheduled delivery) are done. Paddle billing and hardening come next (spec §15).

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

## Checks

```bash
npm run lint && npm run typecheck && npm test   # unit + integration (uses TEST_DATABASE_URL)
npm run test:e2e                                # builds and runs on :3100 against the test database
```

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
- Private links are 32 random bytes; only their SHA-256 hash is stored, so a link is shown once and can be rotated or
  revoked. Links expire after 30/60/90 days and are served with `noindex` and `no-referrer`.
