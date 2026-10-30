import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Container,
  Faq,
  PortfolioPreview,
  PricingTable,
  SectionHead,
  SiteFooter,
  SiteHeader,
} from "@/components/landing";
import { ButtonLink } from "@/components/ui/button";
import { REFUND_DAYS } from "@/lib/legal";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/plans";
import reportAudit from "@/public/landing/report-audit.jpg";
import reportAvailability from "@/public/landing/report-availability.jpg";
import reportCover from "@/public/landing/report-cover.jpg";

// Public landing page. Signed-in visitors never see it: proxy.ts sends them to /overview.
// Report images are screenshots of lib/reports/render.ts output with fictional data.

export const metadata: Metadata = {
  title: { absolute: "Client Status · Website monitoring and monthly client reports for agencies" },
  description:
    "Monitor every client website — uptime, SSL, domains and broken links — and send each client a branded monthly report. Built for agencies.",
  openGraph: { images: [{ url: "/landing/report-cover.jpg", width: 1588, height: 2246 }] },
};

const intervals = Object.values(PLANS).map((p) => p.uptimeIntervalSeconds / 60);

const FEATURES: { name: string; detail: string; text: string }[] = [
  {
    name: "Uptime",
    detail: `every ${Math.min(...intervals)}–${Math.max(...intervals)} min`,
    text: "A site counts as down only after two failed checks in a row. Timeouts, rate limits and bot challenges are marked inconclusive: recorded, left out of uptime, and never wake anyone up.",
  },
  {
    name: "SSL certificates",
    detail: "every 6 hours",
    text: "Invalid or expired certificates alert straight away. Expiring ones warn 30, 14, 7 and 1 day ahead.",
  },
  {
    name: "Domains",
    detail: "daily, via RDAP",
    text: "Expiry dates come from the registry. Where a registry doesn’t publish one, you see “n/a”, never a guess.",
  },
  {
    name: "Technical audits",
    detail: "weekly",
    text: "A polite crawl of each site finds broken links (confirmed twice) and missing titles, descriptions, headings and canonical tags. It follows robots.txt.",
  },
  {
    name: "Alerts",
    detail: "email, team only",
    text: "One email when an incident opens and one when it resolves, to the team members you choose. Unacknowledged outages repeat until someone acknowledges them. Clients never get alerts.",
  },
  {
    name: "Monthly reports",
    detail: "on the 1st",
    text: "A white-label PDF and private link for every client, held for your review by default, then sent from your workspace in one click.",
  },
];

const PRINCIPLES: { title: string; text: string }[] = [
  {
    title: "A blip isn’t an outage",
    text: "Downtime starts only after two failed checks in a row, so a single dropped request doesn’t become an incident or a red day in a report.",
  },
  {
    title: "Inconclusive isn’t “up”",
    text: "When a check can’t tell (a timeout or a bot wall), it’s excluded from uptime instead of quietly counted as a pass.",
  },
  {
    title: "Gaps are disclosed, never estimated",
    text: "If a site was added mid-month or an audit was partial, the report says so. The numbers your client sees are the ones we measured.",
  },
];

const FAQ = [
  {
    q: "Do I need a card to start?",
    a: `No. Every workspace starts with a ${TRIAL_DAYS}-day trial with full ${PLANS[TRIAL_PLAN].name} features. You only enter payment details if you choose a plan.`,
  },
  {
    q: "What happens when the trial ends?",
    a: "Monitoring, audits, alerts and new reports pause until you choose a plan. Your clients, websites and history stay in your workspace.",
  },
  {
    q: "Do my clients need an account?",
    a: "No. They get the report as a PDF by email or through a private link that expires after 30, 60 or 90 days. You can revoke a link at any time.",
  },
  {
    q: "Will my clients see alerts when something breaks?",
    a: "No. Alerts go only to your team. Clients see the monthly summary, after you’ve reviewed it.",
  },
  {
    q: "What about sites behind Cloudflare or other bot protection?",
    a: "If a site answers our checks with a bot challenge, the check is marked inconclusive: it isn’t counted as down, doesn’t alert, and shows as a gap rather than as uptime. You can see which sites are affected.",
  },
  {
    q: "Is it a full SEO tool?",
    a: "No. Audits cover basic technical checks — broken links, titles, meta descriptions, headings and canonical tags. There’s no keyword or rank tracking.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: (
      <>
        Cancel any time from the Billing page; your plan runs to the end of the period you paid for. Every charge can be
        refunded in full within {REFUND_DAYS} days — see the <Link href="/refunds">Refund Policy</Link>.
      </>
    ),
  },
  {
    q: "Where is my data stored?",
    a: (
      <>
        On servers in the European Union. The <Link href="/privacy">Privacy Policy</Link> lists what we store, for how
        long, and the providers we use.
      </>
    ),
  },
];

function ReportPage({ src, alt, caption }: { src: typeof reportCover; alt: string; caption: string }) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <Image
        src={src}
        alt={alt}
        placeholder="blur"
        sizes="(min-width: 980px) 340px, (min-width: 720px) 30vw, 90vw"
        className="h-auto w-full border border-border bg-surface"
      />
      <figcaption className="text-[12.5px] text-muted">{caption}</figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <Container className="grid grid-cols-1 gap-10 py-12 nav:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] nav:items-center nav:py-16">
            <div className="flex flex-col gap-5">
              <span className="font-mono text-[12px] tracking-[0.06em] text-muted uppercase">
                For web and maintenance agencies
              </span>
              <h1 className="m-0 text-[40px] leading-[1.04] font-semibold font-stretch-82% tbl:text-[54px]">
                Know first when a client site breaks. Show them every month that it didn’t.
              </h1>
              <p className="m-0 max-w-[560px] text-[16.5px] leading-relaxed text-ink-2">
                Client Status watches every client website — uptime, SSL, domains and broken links — alerts your team
                when something is confirmed down, and sends each client a report with your branding on the 1st.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="/sign-up" size="lg">
                  Start {TRIAL_DAYS}-day free trial
                </ButtonLink>
                <ButtonLink href="#pricing" size="lg" variant="secondary">
                  See pricing
                </ButtonLink>
              </div>
              <p className="m-0 text-[12.5px] text-muted">
                No card needed · Full {PLANS[TRIAL_PLAN].name} features during the trial · Cancel any time
              </p>
            </div>
            <div className="relative mx-auto w-full max-w-[420px] pr-8 pb-8">
              <Image
                src={reportAvailability}
                alt=""
                sizes="380px"
                className="absolute top-8 left-8 h-auto w-[calc(100%-2rem)] border border-border bg-surface"
              />
              <Image
                src={reportCover}
                alt="Cover of a sample monthly website health report, branded for the agency Northfold Studio"
                priority
                placeholder="blur"
                sizes="380px"
                className="relative h-auto w-full border border-border-strong bg-surface"
              />
            </div>
          </Container>
        </section>

        {/* Portfolio */}
        <section>
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead
              kicker="One workspace"
              title="Every client website on one screen"
              intro="Group sites by client, see what needs attention first, and know when each status was last checked. Stale or inconclusive results are labelled as such, never shown as current."
            />
            <PortfolioPreview />
          </Container>
        </section>

        {/* Features */}
        <section className="border-y border-border bg-surface">
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead id="features" kicker="What it watches" title="Monitoring that tells you what’s real" />
            <dl className="m-0 grid border-t border-rule tbl:grid-cols-2">
              {FEATURES.map((f, i) => (
                <div
                  key={f.name}
                  className={`flex flex-col gap-1.5 border-b border-rule py-5 tbl:pr-8 ${i % 2 ? "tbl:border-l tbl:pl-8" : ""}`}
                >
                  <dt className="flex items-baseline gap-3">
                    <span className="text-[16px] font-semibold">{f.name}</span>
                    <span className="font-mono text-[12px] text-muted">{f.detail}</span>
                  </dt>
                  <dd className="m-0 text-[14.5px] leading-relaxed text-ink-2">{f.text}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        {/* Report */}
        <section>
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead
              id="report"
              kicker="The monthly report"
              title="A report that shows the work behind the retainer"
              intro="On the 1st, every client gets five pages with your logo and colours: availability day by day, confirmed incidents, speed, certificates and domains, audit findings, and what happens next. Plain language, no dashboards to decode."
            />
            <div className="grid gap-6 tbl:grid-cols-3">
              <ReportPage
                src={reportCover}
                alt="Report cover with a summary and the month at a glance"
                caption="Cover: a plain-language summary and the month at a glance."
              />
              <ReportPage
                src={reportAvailability}
                alt="Report page showing uptime per website, a day-by-day strip and confirmed incidents"
                caption="Availability: uptime, coverage, day by day, and every confirmed incident."
              />
              <ReportPage
                src={reportAudit}
                alt="Report page listing audit findings by priority"
                caption="Audit: what to fix now, what to improve, and when it was first found."
              />
            </div>
            <p className="m-0 text-[12.5px] text-muted">Sample report with fictional agency, client and websites.</p>
          </Container>
        </section>

        {/* Principles */}
        <section className="border-y border-border bg-surface">
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead
              kicker="Honest by design"
              title="Numbers you can put in front of a client"
              intro="A report is only useful if your client can trust it. These rules are built into every check and every page."
            />
            <div className="grid border-t border-rule tbl:grid-cols-3">
              {PRINCIPLES.map((p, i) => (
                <div
                  key={p.title}
                  className={`flex flex-col gap-2 border-b border-rule py-5 tbl:border-b-0 tbl:pr-6 ${i ? "tbl:border-l tbl:pl-6" : ""}`}
                >
                  <h3 className="m-0 text-[16px] font-semibold">{p.title}</h3>
                  <p className="m-0 text-[14.5px] leading-relaxed text-ink-2">{p.text}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Pricing */}
        <section>
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead
              id="pricing"
              kicker="Pricing"
              title="Priced by the number of sites you look after"
              intro={`Start with ${TRIAL_DAYS} days free, no card. Pay monthly, or yearly and get two months free.`}
            />
            <PricingTable />
          </Container>
        </section>

        {/* FAQ */}
        <section className="border-t border-border bg-surface">
          <Container className="flex flex-col gap-8 py-14">
            <SectionHead id="faq" kicker="Questions" title="Before you start" />
            <Faq items={FAQ} />
          </Container>
        </section>

        {/* Closing call to action */}
        <section className="bg-ink text-white">
          <Container className="flex flex-col gap-5 py-14 tbl:flex-row tbl:items-center">
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-[30px] leading-[1.12] font-semibold font-stretch-85%">
                Add your first client website today.
              </h2>
              <p className="m-0 text-[15px] text-[#D5D8D4]">
                {TRIAL_DAYS} days free, no card. Your first report can go out on the 1st.
              </p>
            </div>
            <Link
              href="/sign-up"
              className="inline-flex h-[42px] items-center justify-center bg-surface px-4 text-sm font-semibold whitespace-nowrap text-ink no-underline hover:bg-nav-hover hover:text-ink tbl:ml-auto"
            >
              Start free trial
            </Link>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
