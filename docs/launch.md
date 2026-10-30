# Launch checklist

Client Status launches publicly with open sign-up and a 14-day Growth trial — there is no private beta (decided
28 Oct 2026; spec §15 Phase 5 is updated). This is the checklist for going live with what is built today, and what to
watch afterwards.

## Before launch

- [ ] Production Postgres (Neon) migrated with `npm run db:deploy`; daily backups on.
- [ ] Web app and worker deployed separately, sharing `STORAGE_DIR` (PDFs, logos). `npx playwright install chromium
      --with-deps` on the worker host. With Docker/Coolify, `docker-compose.prod.yml` does both (README → Deploy).
- [ ] `/terms`, `/privacy` and `/refunds` show `LEGAL_NAME` and `SUPPORT_EMAIL` (no "not set" markers), and
      `SUBPROCESSORS` in `lib/legal.ts` matches the real providers. Submit the domain for Paddle's review early: it can
      take days.
- [ ] `/bot` opens publicly with the `SUPPORT_EMAIL` contact, and the domain in the crawler's User-Agent
      (`lib/monitoring/safe-fetch.ts`) is ours. Abuse emails to the server host are answered the same day.
- [ ] `TRUSTED_PROXY_HOPS` matches the proxies in front of the web app (or `CLIENT_IP_HEADER` names the header the edge
      sets), and the web app isn't reachable around them: rate limits key on that address.
- [ ] Deploys run `npm run db:deploy` first, then the worker, then the web app: the worker must understand what the
      web app queues (e.g. sealed report links).
- [ ] Worker port 3001 private; `/health` wired to the process manager and an external uptime check on the web app's
      `/api/health`.
- [ ] Resend: verified sending domain (SPF, DKIM, DMARC), `EMAIL_DELIVERY=resend`, bounce webhook with
      `RESEND_WEBHOOK_SECRET`.
- [ ] Paddle **production**: products with a monthly and a yearly price each (`PADDLE_PRICE_*` and
      `PADDLE_PRICE_*_YEARLY`, amounts from `lib/plans.ts`), `PADDLE_ENVIRONMENT=production`, API key, client token,
      webhook destination and secret. Make one real purchase and refund it.
- [ ] `OPS_ADMIN_EMAILS` set to the team; `/ops` opens and shows a live worker. `SUPPORT_EMAIL` set.
- [ ] Load test re-run on the production worker size (`npm run load-test`), concurrency set from the results
      ([load-test.md](load-test.md)).

## What to watch, daily for the first weeks

- `/ops`: workers alive, oldest due job under 2 minutes, failure rate, email failures, failed jobs (requeue after fixing
  the cause).
- Billing webhooks "ignored" counter: anything other than duplicates needs a look in the logs.
- False positives: incidents that resolved within two checks, and inconclusive-heavy sites (bot protection).
- Abuse: bursts of trial sign-ups, report email volume per workspace, and bounces and complaints (`/ops` email
  failures). Trials can send 25 report emails and generate 20 previews a day; the limits are in
  `lib/reports/send.ts`, `lib/reports/schedule.ts` and `lib/auth-limits.ts`.

## Decisions to settle from real usage (spec §17)

Final crawl budgets and audit frequency per plan · retention for checks and findings · grace/downgrade rules (current:
14 days past due, access to period end after cancelling) · whether reports auto-send by default (current: hold for
review) · report email and preview allowances (current: 25 emails and 20 previews a day on trials) · final pricing. Spec §15 Phase 6 items (Slack/webhook alerts, custom report domains, …) are prioritised the
same way.
