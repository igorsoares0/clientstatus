# Handoff: Client Status — agency website health monitoring

## Overview
Client Status is a B2B SaaS for digital and maintenance agencies. It monitors client websites (uptime, response time, SSL, domain expiry, DNS changes, weekly technical audits), manages confirmed incidents, and produces a white-label monthly health report the agency sends to each client.

This bundle covers the full product surface: operational workspace (Overview, Websites, Website Detail, Incidents, Clients), reporting (Reports history + review-before-send, Monthly Report PDF), administration (Settings, Billing, Team) and first-run Onboarding.

`Spec-Driven-Development.md` is the product source of truth (features, scope, data limits). `Design Review.md` is the design director audit with open items.

## About the design files
The files in `designs/` are **design references built in HTML** — working prototypes that show intended look, content and behaviour. They are **not production code to copy**. Recreate them in the target codebase's environment (React/Vue/etc.) using its established patterns. If there is no codebase yet, choose a suitable stack (e.g. React + a headless component library + CSS variables) and implement there.

Each `*.dc.html` opens directly in a browser (it loads `support.js` from the same folder). Markup is in `<x-dc>`; behaviour and sample data are in the `class Component` script at the bottom of each file — read it for exact state logic, copy strings and edge-case data. Several files expose demo-state switches as props (see "Demo states").

## Fidelity
**High-fidelity.** Colours, type, spacing, copy and interactions are final. Recreate pixel-accurately. Sample data is realistic but fictional (agency "Northfold Studio", user "Priya Raman", "now" = 25 Oct 2026 09:48 Europe/London).

---

## Design principles (non-negotiable)
1. **Never present stale or inconclusive data as current.** Every status carries its last-check time. Stale = "○ Stale · last known value as of HH:MM". Inconclusive checks (timeouts, 429, bot challenges) are drawn as ◌, excluded from uptime, and never alert.
2. **Never fabricate.** If a registry doesn't publish domain expiry, show "n/a — not published by registry", never a date. Reports disclose coverage gaps and partial audits; findings say "first found <date>", never implying the whole month.
3. **Colour is never the only signal.** Every state has a glyph + text label. Status and severity use *different* glyph systems (below).
4. **Red is reserved** for confirmed down / critical / destructive. No gradients, no decorative shadows, square corners.
5. **Tables over cards.** Dense, scannable rows; cards only for genuinely separate objects.
6. **Agency branding never overrides semantics.** Brand colour touches report cover, rules and section numbers only.

---

## Design tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| ink | `#161A1C` | Primary text, primary buttons, active nav, status bar bg |
| ink-2 | `#2E3437` | Body text secondary, button hover |
| muted | `#4A4F52` | Meta text, labels (≥ 4.5:1 on white) |
| faint | `#8D9396` | Disabled, "—" in permission matrix |
| border-strong | `#B9BDB8` | Inputs, secondary buttons |
| border | `#D5D8D4` | Panels, nav divider |
| rule | `#E2E4E1` / `#E7E9E6` | Row separators |
| rule-soft | `#F0F1EF` | Event-history rows |
| canvas | `#F4F5F3` | App background, confirm-panel bg |
| surface | `#FFFFFF` | Panels, tables |
| row-hover | `#F1F3F1` | Row hover |
| row-selected | `#E8EDE9` + inset 3px ink left edge | Selected row |
| up | `#1F7A4A` | Up / passed / sent / valid |
| degraded | `#A35A00` | Degraded / warning / needs review |
| down | `#C2261B` | Down / critical / destructive / error text |
| down-tint | `#FBEDEB`, border `#EBC3BE` | Down row bg, payment-failed banner |
| warn-tint | `#FBF1E4`, border `#E2C9A3`, text `#3A2A14`/`#7A4300` | Stale/delayed banners, confirmation callouts |
| no-data | `#C9CDC8` (+ hatched `repeating-linear-gradient(45deg,#8D9396 0 2px,#E2E4E1 2px 4px)` in reports) | Gaps in check strips |
| status-bar dots | `#5FD39A` ok / `#F2A65A` delayed | Footer on dark |

Report-only (print-safe): up `#2E7D55`/`#1F6B45`, down `#B42318`, warn `#8A5A00`, warn-tint `#FBF3E6`.

### Status glyphs (website monitoring state)
| State | Glyph | Text colour | Glyph colour | Weight |
|---|---|---|---|---|
| Up | ● | ink | up | 400 |
| Degraded | ▲ | degraded | degraded | 600 |
| Down | ◆ | down | down | 600 |
| Stale / Unknown | ○ | ink / muted | muted | 600 / 400 |
| Paused | ‖ | muted | muted | 400 |
| Inconclusive check | ◌ | muted | muted | — |

### Severity (incidents, findings) — level meter, distinct from status
`▮▮▮▮ Critical` (down) · `▮▮▮▯ High` (degraded) · `▮▮▯▯ Medium` (ink) · `▮▯▯▯ Low` (muted) · `▯▯▯▯ Info`. Once an incident is acknowledged/muted/resolved, its severity text drops to muted so only *open* items look urgent.

### Typography
- **Archivo** (Google Fonts, variable `wdth 75–100`, wght 400–700) for all UI and report text. Headings use `font-stretch` 80–88% (condensed) and weight 600.
- **JetBrains Mono** 400–600 for hostnames, URLs, IDs (INC-0412), timestamps, keyboard shortcuts, the status bar.
- `font-variant-numeric: tabular-nums` on every numeric column.

| Role | Size / weight / stretch |
|---|---|
| Page H1 | 22px / 600 / 85% (detail pages 26px / 84%) |
| Section H2 | 17px / 600 / 85% (panel titles 15px / 600) |
| Detail title (incident) | 22px / 600 / 86% |
| Body / table | 13–14px / 400, line-height 1.45–1.5 |
| Column header | 11.5–12px, letter-spacing .03em, UPPERCASE, muted |
| Meta | 12–12.5px muted (minimum 12px in app) |
| Mono meta | 12px |
| Report body | 14.5–16.5px; report section H2 30px / 600 / 85%; cover H1 46px / 82% |

### Spacing, shape, elevation
- Spacing in 4px steps; common: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28. Page gutter 28px. Panel padding 12–16px. Table cell padding 8–10px vertical, 16px outer horizontal.
- **Radius: 0 everywhere.**
- Borders: 1px. Active tab underline 2px ink. Selected row inset 3px.
- Shadows only on overlays: drawer `-16px 0 40px rgba(0,0,0,.14)`, modal `0 20px 48px rgba(0,0,0,.2)`, toast `0 8px 24px rgba(0,0,0,.2)`. Backdrop `rgba(22,26,28,.28–.36)`.
- Controls: inputs/selects 32–40px tall, 1px `#B9BDB8`; primary button ink bg / white 600; secondary white / 1px border-strong; destructive text-link in down or filled down in confirm step only.
- Focus: `outline: 2px solid #161A1C; outline-offset: 2px` on `:focus-visible`.

### Icons
Inline SVG, 24 viewBox, stroke `currentColor`, stroke-width 1.75, square caps, miter joins, 15–16px, `aria-hidden`. Used **only** in: sidebar nav (Overview=activity line, Websites=globe, Clients=briefcase, Incidents=triangle, Reports=document, Team=users, Settings=sliders, Billing=card), search fields (magnifier, input padding-left 32px), and primary add/import buttons (+, upload). Not on headings, rows or statuses. Swap for the codebase's icon set (e.g. Lucide) keeping these rules.

---

## Global shell
- **Sidebar** 200px, white, right border, sticky full-height. Top: workspace name (17px/700/80%) + plan line (`Growth plan · 84 of 100 sites`). Items 8px×16px with icon + label + mono shortcut hint (`G O`, `G W`…). Active item: ink bg, white text. Divider, then Team / Settings / Billing (muted). Bottom: user name, role · timezone, small "Client Status" product mark. Incidents shows red mono count of **unacknowledged** incidents.
- **< 980px:** sidebar becomes a horizontal scrolling top bar.
- **Status bar footer** (dark ink, mono 12px, nowrap spans): `● Monitoring current · Newest result 09:48:02 · next SSL sweep 12:00 · Times in Europe/London (GMT)`. When delayed: amber dot + "Results delayed since 09:31" + what that means. Never shows internal queue metrics.
- **Toasts** bottom-centre, ink, with Undo for reversible actions (7s) else 3.5s. `aria-live="polite"`.

## Screens

### 1. Overview (`Overview.dc.html`)
Answers "which client sites need attention now". Header: portfolio summary sentence ("3 websites at risk"), freshness line, counts (84 active, at-risk, active incidents with "N not acknowledged"). Health distribution bar (Up/Degraded/Down/Stale/Paused) with glyph legend. Filters: client, status, severity, search. **Attention list** (ranked: down → SSL invalid → degraded/expiring → stale) with severity meter, title, host, timing. **Websites table** shows *only sites with something to look at*, followed by "76 other websites passed every check in the last 24 h · 2 paused · View in Websites". Secondary column: recent activity, latest reports. Drawer opens a site summary with "Full website page" → Website Detail. States: live, delayed/stale, loading skeleton, error, empty workspace (add first website).

### 2. Websites (`Websites.dc.html`)
Compact inventory table, sticky header + sticky name column, min-width 1150px with horizontal scroll ≥720px. Columns: Website (name + mono host, ellipsis), Client, Status (glyph + label + sub), Uptime (period select 24h/7d/30d), Response, SSL (days; amber ≤30, red ≤7/invalid), Incidents, Last audit, Last check (mono; amber when stale). Sorting on headers (`aria-sort`), search, filters, pagination (25/page), row checkboxes + select-all. **Bulk pause/resume** bar (dark) with explicit consequence confirmation; if nothing applicable, buttons stay enabled and explain ("All selected are paused"). Add website dialog (URL validation, client assignment, plan-slot check). **Import CSV** flow: upload → row-level validation table (valid / warning / error per row, e.g. duplicate, invalid URL, unknown client) → import only valid rows. **<720px:** rows become stacked list items (checkbox, name, host, then status · uptime · SSL · last check, nowrap). Domain expiry for unsupported TLDs shows "n/a" with reason.

### 3. Website Detail (`Website Detail.dc.html`)
Breadcrumb Websites / Client / host. Title + URL + client link + interval. Actions: Run check now, Pause monitoring… (inline confirmation listing consequences). **Status bar** tinted by state with freshness and next check. Left sticky "On this page" index (scroll-spy) ≥980px. Sections: Summary facts grid; Uptime history (24h/7d/30d segmented, cell strip with no-data grey, legend, failed/inconclusive/coverage counts); SSL & domain (source + checked time); Audit findings table (severity, finding, first found, page → target; rerun audit with quota); Incidents list; Reports; Settings form (display name, timeout, down policy radio; dirty-state save).

### 4. Incidents (`Incidents.dc.html`)
Split view: list (~540px flex) + sticky detail (~560px). List grouped: **Needs acknowledgment** (severity desc) → **Acknowledged — follow up** → **Muted** → **Resolved · last 30 days**. Inconclusive-only sites appear as a grey "Watching — not an incident, no alert" row. Row: severity meter + label, title, host · client · type, state + duration (mono). Filters: state tabs with counts, severity, type, client, search. Detail: ID · type, severity, state chip with who/when, title, host link → Website Detail, actions (Acknowledge; Mute alerts… with inline consequence list; Unmute; Open website; Audit findings), facts (first/last detected, duration, resolved), Recovery ("0 of 2 recovery checks passed. Next check 09:49:04"), latest diagnostic with ◆ failed / ◌ inconclusive (not counted) / ● passed counts, alerts sent, internal note form ("team only, never in client reports"), event history filter (All / Changes & notes / Checks). Every state change writes an event + undo toast. **<1180px** detail becomes a right drawer (Esc closes, focus to Close). Stale state: recovery = "Unknown — results delayed", times "as of 09:31". No manual Resolve — incidents auto-resolve per spec.

### 5. Clients (`Clients.dc.html`)
List sorted by attention: client + contact, websites (count + status summary), top issue (severity), September report state. Tabs Active / Need attention / Archived, search across name/contact/host, Add client modal (name required, duplicate + email validation). Detail: header (contact, since), Edit details inline form, Archive… (keeps history; choose keep sites as Unassigned vs pause them). Sections: Needs attention, Websites table, Monthly reports (October in-progress with "Generate preview now" → partial, not sent; "Review & send September" when held), sidebar Report recipients (confirmed / not yet confirmed / bounced) and Internal notes. Archived state with Restore. `?c=<id>` deep-link.

### 6. Reports (`Reports.dc.html`)
History table per period (Sep/Aug/Jul) with status (▲ Needs review / ● Sent / ○ No data), data notes, delivery (bounces in red), private link state (active/expired/revoked), action (Review / Preview). **Review flow**: left = scaled live preview of the real report with jump-to-page; right = 1 Data gaps checklist (each with "show" jump), 2 Kept out of the report, 3 Branding + contrast result, 4 Recipients (add/validate; first-delivery confirmation checkbox), 5 Private link expiry 30/60/90. Sticky footer: Send disabled with "To send: …" blocker list. Sent view: per-recipient delivery, copy/revoke (confirm)/resend link, disclosures. Empty state explains first generation date.

### 7. Monthly Report (`Monthly Report.dc.html`) — client-facing, white-label, 5 × A4/Letter pages
1 **Cover**: brand band (logo on white plate or initials mark), "WEBSITE HEALTH REPORT", client, sites, period + timezone, plain-language summary, prepared for/by, report ID, "September at a glance" 4 figures with August comparison, incomplete-data callout when applicable. 2 **Was the website available?** uptime/coverage table, 30-day strip (passed / confirmed downtime / hatched gaps), confirmed incidents, "How we measure this". 3 **Was it fast and secure?** daily median bars vs dashed August line, SSL & domain table (state from data). 4 **What did the latest audit find?** audit meta, limitation callouts, findings by Fix/Improve/Advisory, "when these appeared", scope disclaimer. 5 **What happens next**: open items (who/when), dates to know, "About this report's data", contact box, generated timestamp. Running header (agency · client · period) and footer (ID · Page X of 5). Brand rules: cover text auto white/dark for ≥4.5:1; brand text darkened until AA on white; semantic colours fixed. Never includes internal notes, team names, raw diagnostics. Props: `report` (harbour | greenroom = incomplete-data example), `brandColor`, `agencyName`, `logoUrl`, `contact`.

### 8. Settings (`Settings.dc.html`)
Tabs: **Alerts** (team recipients with verification/pending; event matrix opened/resolved per type with rules; inconclusive never emails; repeat cooldown 30/60/240/never with plain-language effect; per-site overrides list), **Report branding** (agency name, logo upload PNG/SVG ≤1MB with errors, swatches + hex with validation, live contrast readout, contact + footer with 90-char counter, live cover preview), **Report schedule** (hold all vs auto-send except gapped/unconfirmed; link expiry). Sticky dark unsaved-changes bar listing what changed; Save blocked if no alert recipient.

### 9. Billing (`Billing.dc.html`)
Plan card (Growth US$99/mo, state chip, usage meter 84/100 with 90% marker, limits), invoices, payment method, billing details. All changes go to Paddle customer portal. Demo states: active, pastdue (banner: monitoring continues until 7 Nov, retry dates), limit (existing monitoring never stops; can't add), canceled.

### 10. Team (`Team.dc.html`)
Members (role select Admin/Member with undo; Owner fixed; Remove… with consequence confirmation), Invite people (comma-separated emails, invalid/duplicate validation, role radio with descriptions), Pending invites (expires 7 days; expired highlighted; resend/revoke), role permission matrix (● / —, with aria labels). Team members don't count toward plan.

### 11. Onboarding (`Onboarding.dc.html`)
4 steps with indicator: Account (name, email, password ≥12 with live counter) → Verify email (resend, change address) → Workspace (agency name, detected timezone) → First website (URL validation, HTTPS warning, client) → Done (first check result: HTTP, SSL, domain or "expiry not available", next steps).

## Interactions & behaviour (cross-cutting)
- Keyboard: all controls native buttons/links; Esc closes drawers/dialogs/confirmations; focus moves into opened drawers/modals; nav shortcut hints `G + letter`.
- Destructive or broad actions (bulk pause, mute, archive, remove member, revoke link) use **inline confirmation panels** that list concrete consequences, then an undo toast where reversible.
- Loading: skeleton rows matching final row geometry. Errors: plain-language cause + what still works ("Detection and alert emails are unaffected") + Try again.
- Responsive breakpoints: 1180 (incident detail → drawer), 980 (sidebar → top bar), 720 (tables → stacked rows).
- No decorative animation; only hover background changes and smooth scroll for in-page jumps.

## State & data (implementation notes)
- Each website: status, sub-reason, lastCheckAt, nextCheckAt, uptime per period with completed/conclusive/inconclusive/not-run counts, median response, SSL {state, expiresAt, issuer, checkedAt}, domain {expiresAt | unsupported reason, source, checkedAt}, audit {date, status complete|partial, pages, findings}.
- Freshness: derive "stale" when now − lastCheckAt > 2 × interval or worker delayed; UI must switch to last-known wording.
- Incident: id, type, severity, state open|acknowledged|muted|resolved, first/last detected, resolvedAt, recovery progress, events[] (checks, state changes, notes, emails), actor per change.
- Report: period, status needs_review|sent|no_data, disclosures[], recipients with confirmation + delivery status, private link {expiresAt, revokedAt}.
- Counts must be computed from one source everywhere (nav badge = unacknowledged incidents).

## Demo states (props in each file)
Incidents `state`: live | stale | loading | empty | error. Reports `state`: live | empty. Monthly Report `report`, branding props. Settings `tab`. Billing `billing`. Onboarding `step`.

## Assets
No raster assets. Fonts: Archivo + JetBrains Mono (Google Fonts). Icons: inline SVG (see Icons). Agency logo is user-uploaded.

## Screenshots
`screenshots/` — reference captures at the default preview width (live state, 25 Oct 2026 09:48):
- 01-overview · 02-websites · 03-website-detail · 04-incidents
- 01-05-clients (list) · 02-05-clients (Harbour Dental detail)
- 01-06-reports (history) · 02-06-reports (review flow — the embedded report preview is blank in the capture; open the HTML to see it)
- 01…05-07-report (Monthly Report pages 1–5)
- 01-08-settings (Alerts) · 02-08-settings (Report branding)
- 09-billing · 10-team · 11-onboarding
Captures are DOM re-renders; when in doubt, the HTML file is authoritative.

## Files
`designs/` — Overview, Websites, Website Detail, Incidents, Clients, Reports, Monthly Report, Settings, Billing, Team, Onboarding (`.dc.html`), plus `support.js` (prototype runtime) and `doc-page.js` (paged-document shell for the report). `Design Review.md` — audit + remaining items. `Spec-Driven-Development.md` — product spec.

## Known gaps
- Logo uploaded in Settings is not yet wired into the report cover in the prototype (report accepts `logoUrl`).
- Website Detail is modelled on one site (harbourdental.co.uk); report previews exist for two clients.
- Reports history table scrolls horizontally on phones (no stacked layout yet).
