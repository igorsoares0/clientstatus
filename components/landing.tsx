import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { type SiteStatus, StatusGlyph } from "@/components/ui/status";
import { LEGAL_PAGES } from "@/lib/legal";
import { BRANDING_LABEL, monthsFreeYearly, PLAN_ORDER, PLANS, type Plan, TRIAL_DAYS } from "@/lib/plans";

// Public landing page pieces (app/page.tsx). Same design system as the app: square corners,
// tables over cards, colour only for status. Sample data is fictional and uses .example domains.

export const NAV = [
  { href: "#features", label: "Features" },
  { href: "#report", label: "Report" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1120px] px-4 tbl:px-7 ${className}`}>{children}</div>;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <Container className="flex h-14 items-center gap-6">
        <Link href="/" className="text-[17px] font-bold font-stretch-80% no-underline">
          Client Status
        </Link>
        <nav aria-label="Sections" className="hidden gap-5 text-[13px] tbl:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-ink-2 no-underline hover:text-ink hover:underline">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <Link href="/sign-in" className="text-[13px] no-underline hover:underline">
            Sign in
          </Link>
          <ButtonLink href="/sign-up" size="sm">
            Start free trial
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}

export function SectionHead({
  id,
  kicker,
  title,
  intro,
}: {
  id?: string;
  kicker: string;
  title: string;
  intro?: ReactNode;
}) {
  return (
    <div className="flex max-w-[720px] flex-col gap-2">
      <span id={id} className="scroll-mt-20 font-mono text-[12px] tracking-[0.06em] text-muted uppercase">
        {kicker}
      </span>
      <h2 className="m-0 text-[30px] leading-[1.12] font-semibold font-stretch-85% tbl:text-[34px]">{title}</h2>
      {intro ? <p className="m-0 text-[15.5px] leading-relaxed text-ink-2">{intro}</p> : null}
    </div>
  );
}

const SAMPLE: {
  host: string;
  client: string;
  status: SiteStatus;
  label?: string;
  uptime: string;
  ssl: string;
  last: ReactNode;
}[] = [
  {
    host: "harbourdental.example",
    client: "Harbour Dental Group",
    status: "up",
    uptime: "99.97%",
    ssl: "46 days",
    last: "09:46",
  },
  {
    host: "book.harbourdental.example",
    client: "Harbour Dental Group",
    status: "up",
    uptime: "100%",
    ssl: "Renews in 19 days",
    last: "09:47",
  },
  {
    host: "greenroomtheatre.example",
    client: "Green Room Theatre",
    status: "degraded",
    label: "Degraded · slow",
    uptime: "99.91%",
    ssl: "71 days",
    last: "09:47",
  },
  {
    host: "ashfordlane.example",
    client: "Ashford & Lane Legal",
    status: "down",
    label: "Down · 6 min",
    uptime: "99.62%",
    ssl: "112 days",
    last: "09:47",
  },
  {
    host: "millbrookbakery.example",
    client: "Millbrook Bakery",
    status: "up",
    uptime: "100%",
    ssl: "30 days",
    last: (
      <span className="text-muted">
        <span aria-hidden="true">◌</span> 09:45 · bot challenge
      </span>
    ),
  },
];

/** A static rendition of the Websites screen, built from the real status glyphs. */
export function PortfolioPreview() {
  return (
    <figure className="m-0 border border-border bg-surface">
      <div className="flex items-baseline gap-3 border-b border-rule px-4 py-3">
        <span className="text-[15px] font-semibold">Websites</span>
        <span className="font-mono text-[12px] text-muted">5 of 50</span>
        <span className="ml-auto text-[12px] text-muted">Sample data</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="text-left text-[11.5px] tracking-[0.03em] text-muted uppercase">
              <th className="px-4 py-2 font-normal">Website</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="px-2 py-2 text-right font-normal">Uptime 30d</th>
              <th className="px-2 py-2 font-normal">SSL</th>
              <th className="px-4 py-2 font-normal">Last check</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((s) => (
              <tr key={s.host} className={`border-t border-rule ${s.status === "down" ? "bg-down-tint" : ""}`}>
                <td className="px-4 py-2.5">
                  <span className="block font-mono text-[12.5px]">{s.host}</span>
                  <span className="block text-[12px] text-muted">{s.client}</span>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <StatusGlyph status={s.status} label={s.label} />
                </td>
                <td className="px-2 py-2.5 text-right">{s.uptime}</td>
                <td className={`px-2 py-2.5 whitespace-nowrap ${s.ssl.startsWith("Renews") ? "text-degraded" : ""}`}>
                  {s.ssl}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap">{s.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function minutes(plan: Plan) {
  const m = plan.uptimeIntervalSeconds / 60;
  return `Every ${m} min`;
}

const PLAN_ROWS: { label: string; value: (p: Plan) => ReactNode }[] = [
  { label: "Websites", value: (p) => `Up to ${p.maxActiveSites}` },
  { label: "Uptime checks", value: minutes },
  { label: "Weekly audit", value: (p) => `Up to ${p.maxPagesPerAudit.toLocaleString("en-US")} pages per site` },
  { label: "Extra audit runs", value: (p) => `${p.manualAuditsPerWeek} per week` },
  { label: "Team seats*", value: (p) => String(p.maxTeamMembers) },
  { label: "Report branding", value: (p) => BRANDING_LABEL[p.reportBranding] },
];

function Price({ plan }: { plan: Plan }) {
  return (
    <>
      <span className="block text-[15px] font-semibold">{plan.name}</span>
      <span className="mt-1 block">
        <span className="text-[30px] font-semibold font-stretch-85% tabular-nums">${plan.priceUsdMonthly}</span>
        <span className="text-[13px] text-muted"> / month</span>
      </span>
      <span className="block text-[12.5px] text-muted">
        or ${plan.priceUsdYearly.toLocaleString("en-US")} / year · {monthsFreeYearly(plan)} months free
      </span>
    </>
  );
}

/** Comparison table on wide screens, one block per plan on phones. Values come from lib/plans.ts. */
export function PricingTable() {
  const plans = PLAN_ORDER.map((k) => PLANS[k]);
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden border border-border bg-surface tbl:block">
        <table className="w-full table-fixed border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="w-[26%] px-5 py-5 text-left align-bottom text-[11.5px] font-normal tracking-[0.03em] text-muted uppercase">
                Plan
              </th>
              {plans.map((p) => (
                <th key={p.key} className="border-l border-rule px-5 py-5 text-left align-top font-normal">
                  <Price plan={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_ROWS.map((r) => (
              <tr key={r.label} className="border-t border-rule">
                <th scope="row" className="px-5 py-2.5 text-left font-normal text-muted">
                  {r.label}
                </th>
                {plans.map((p) => (
                  <td key={p.key} className="border-l border-rule px-5 py-2.5">
                    {r.value(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-rule">
              <td className="px-5 py-4" />
              {plans.map((p) => (
                <td key={p.key} className="border-l border-rule px-5 py-4">
                  <ButtonLink href="/sign-up" variant={p.key === "growth" ? "primary" : "secondary"} className="w-full">
                    Start free trial
                  </ButtonLink>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 tbl:hidden">
        {plans.map((p) => (
          <section key={p.key} aria-label={`${p.name} plan`} className="border border-border bg-surface px-4 py-4">
            <Price plan={p} />
            <dl className="m-0 mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-[13px]">
              {PLAN_ROWS.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="m-0">{r.value(p)}</dd>
                </div>
              ))}
            </dl>
            <ButtonLink href="/sign-up" variant={p.key === "growth" ? "primary" : "secondary"} className="mt-4 w-full">
              Start free trial
            </ButtonLink>
          </section>
        ))}
      </div>

      <p className="m-0 text-[12.5px] leading-relaxed text-muted">
        Every plan includes SSL and domain monitoring, email alerts, CSV import and monthly white-label reports with
        private links. Prices in US dollars; sales tax or VAT is added at checkout where it applies. Every trial starts
        with {TRIAL_DAYS} days of Growth. *Team invites arrive in an upcoming release.
      </p>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="border-t border-border">
      {items.map((it) => (
        <details key={it.q} className="group border-b border-border">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            {it.q}
            <span aria-hidden="true" className="font-mono text-muted group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="max-w-[760px] pb-5 text-[14.5px] leading-relaxed text-ink-2">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="flex flex-col gap-3 py-8 text-[12.5px] text-muted tbl:flex-row tbl:items-center">
        <span className="text-[15px] font-bold text-ink font-stretch-80%">Client Status</span>
        <span>Website monitoring and monthly client reports for agencies.</span>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 tbl:ml-auto">
          {LEGAL_PAGES.map((p) => (
            <Link key={p.href} href={p.href}>
              {p.label}
            </Link>
          ))}
          <Link href="/bot">Our crawler</Link>
        </nav>
      </Container>
    </footer>
  );
}
