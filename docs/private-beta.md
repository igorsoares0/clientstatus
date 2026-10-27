# Private beta runbook

Spec §15 Phase 5 ends with a private beta for a small group of agencies. This is the checklist for running it with
what is built today.

## Before inviting anyone

- [ ] Production Postgres (Neon) migrated with `npm run db:deploy`; daily backups on.
- [ ] Web app and worker deployed separately, sharing `STORAGE_DIR` (PDFs, logos). `npx playwright install chromium
      --with-deps` on the worker host.
- [ ] Worker port 3001 private; `/health` wired to the process manager and an external uptime check on the web app's
      `/api/health`.
- [ ] Resend: verified sending domain (SPF, DKIM, DMARC), `EMAIL_DELIVERY=resend`, bounce webhook with
      `RESEND_WEBHOOK_SECRET`.
- [ ] Paddle **production**: products and monthly prices for Starter/Growth/Pro, `PADDLE_ENVIRONMENT=production`, API
      key, client token, webhook destination and secret. Make one real purchase and refund it.
- [ ] `SIGNUP_ALLOWLIST` set to the invited agencies' emails or domains.
- [ ] `OPS_ADMIN_EMAILS` set to the team; `/ops` opens and shows a live worker.
- [ ] Load test re-run on the production worker size (`npm run load-test`), concurrency set from the results
      ([load-test.md](load-test.md)).

## Inviting an agency

1. Add their address or `@domain` to `SIGNUP_ALLOWLIST` and redeploy (or restart) the web app.
2. They sign up, verify, create the workspace and get a 14-day Growth trial — no card needed.
3. Offer a 20-minute onboarding call: import their sites by CSV, assign clients, add report recipients.

## What to watch each day

- `/ops`: workers alive, oldest due job under 2 minutes, failure rate, email failures, failed jobs (requeue after fixing
  the cause).
- Billing webhooks "ignored" counter: anything other than duplicates needs a look in the logs.
- False positives: incidents that resolved within two checks, and inconclusive-heavy sites (bot protection).

## Questions for the agencies (end of week 2 and week 4)

- Did any alert turn out to be wrong, or did you hear about an outage from a client first?
- Would you send the monthly report as it is? What did you change or wish you could?
- Which plan would you pick at today's prices, and what would make you move up?
- What's missing that you'd need before paying: team invitations, Slack alerts, custom report domain?

## Decisions this beta should settle (spec §17)

Final crawl budgets and audit frequency per plan · retention for checks and findings · grace/downgrade rules (current:
14 days past due, access to period end after cancelling) · whether reports auto-send by default (current: hold for
review) · final pricing.
