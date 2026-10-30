// Renders a fictional monthly report with the real renderer (lib/reports/render.ts) and saves screenshots of
// its pages for the landing page. Re-run after changing the report design: npm run landing:images
// All names and domains are fictional; domains use the reserved .example TLD.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import type { ReportData, SiteReport } from "@/lib/reports/aggregate";
import { renderReportHtml } from "@/lib/reports/render";

const outDir = process.argv[2] ?? "public/landing";
/** Report pages shown on the landing page, by position in the report. */
const SHOTS: Record<number, string> = { 0: "report-cover", 1: "report-availability", 3: "report-audit" };
const TZ = "Europe/London";
const start = "2026-08-31T23:00:00.000Z";
const end = "2026-09-30T23:00:00.000Z";
const perDay = 720; // 2-minute checks (Growth)

function medians(base: number, spread: number, seed: number, from = 0): (number | null)[] {
  return Array.from({ length: 30 }, (_, i) =>
    i < from ? null : Math.round(base + Math.sin(i * 1.7 + seed) * spread + ((i * 37 + seed * 11) % 23) - 11),
  );
}

const mainSite: SiteReport = {
  name: "Main website",
  host: "harbourdental.example",
  https: true,
  monitoredFrom: "2025-11-03T10:00:00.000Z",
  uptimePct: 99.97,
  prevUptimePct: 100,
  conclusive: 21571,
  completed: 21590,
  expected: 30 * perDay,
  coveragePct: 99.95,
  downtimeMinutes: 14,
  pausedMinutes: 0,
  days: Array.from({ length: 30 }, (_, i) => (i === 16 ? "down" : i === 8 ? "partial" : "ok")),
  respMedian: 312,
  respP95: 780,
  prevRespMedian: 298,
  dailyMedians: medians(312, 34, 1),
  ssl: {
    status: "valid",
    detail: "Valid",
    expiresAt: "2026-12-14T12:00:00.000Z",
    checkedAt: "2026-09-30T18:04:00.000Z",
  },
  domain: {
    status: "ok",
    detail: "Registered",
    expiresAt: "2027-03-02T00:00:00.000Z",
    source: "RDAP",
    checkedAt: "2026-09-30T02:03:00.000Z",
  },
  audit: {
    date: "2026-09-26T03:12:00.000Z",
    status: "completed",
    pages: 214,
    budget: 1500,
    links: 1873,
    inconclusive: 6,
    reasons: [],
  },
};

const booking: SiteReport = {
  ...mainSite,
  name: "Online booking",
  host: "book.harbourdental.example",
  monitoredFrom: "2025-11-03T10:00:00.000Z",
  uptimePct: 100,
  prevUptimePct: 100,
  conclusive: 21588,
  completed: 21597,
  coveragePct: 99.99,
  downtimeMinutes: 0,
  days: Array.from({ length: 30 }, () => "ok"),
  respMedian: 188,
  respP95: 410,
  prevRespMedian: 193,
  dailyMedians: medians(188, 18, 4),
  ssl: {
    status: "expiring",
    detail: "Renewal due",
    expiresAt: "2026-10-19T12:00:00.000Z",
    checkedAt: "2026-09-30T18:04:00.000Z",
  },
  audit: {
    date: "2026-09-26T03:31:00.000Z",
    status: "completed",
    pages: 12,
    budget: 1500,
    links: 64,
    inconclusive: 0,
    reasons: [],
  },
};

const careers: SiteReport = {
  ...mainSite,
  name: "Careers",
  host: "harbourdentalcareers.example",
  monitoredFrom: "2026-09-12T09:20:00.000Z",
  uptimePct: 100,
  prevUptimePct: null,
  conclusive: 13668,
  completed: 13671,
  expected: 19 * perDay,
  coveragePct: 99.98,
  downtimeMinutes: 0,
  days: Array.from({ length: 30 }, (_, i) => (i < 11 ? "gap" : "ok")),
  respMedian: 241,
  respP95: 520,
  prevRespMedian: null,
  dailyMedians: medians(241, 22, 7, 11),
  ssl: {
    status: "valid",
    detail: "Valid",
    expiresAt: "2026-11-28T12:00:00.000Z",
    checkedAt: "2026-09-30T18:04:00.000Z",
  },
  domain: {
    status: "unsupported",
    detail: "Not published by registry",
    expiresAt: null,
    source: null,
    checkedAt: "2026-09-30T02:03:00.000Z",
  },
  audit: {
    date: "2026-09-26T03:40:00.000Z",
    status: "completed",
    pages: 9,
    budget: 1500,
    links: 41,
    inconclusive: 0,
    reasons: [],
  },
};

const data: ReportData & { code: string } = {
  version: 1,
  kind: "monthly",
  code: "RPT-0926-HDG",
  client: { name: "Harbour Dental Group", contact: "Dr Amara Okafor" },
  period: { label: "September 2026", start, end, tz: TZ, days: 30, coveredTo: end, toDate: false },
  previousLabel: "August",
  intervalMinutes: 2,
  generatedAt: "2026-10-01T05:04:00.000Z",
  sites: [mainSite, booking, careers],
  incidents: [
    {
      host: "harbourdental.example",
      title: "Website down — server error (HTTP 503)",
      start: "2026-09-17T06:42:00.000Z",
      end: "2026-09-17T06:56:00.000Z",
      minutes: 14,
      resolved: true,
    },
  ],
  findings: [
    {
      priority: "fix",
      label: "Broken links",
      count: 4,
      examples: ["/our-team → /team/dr-lewis (404)", "/blog/whitening-guide → /offers/2025 (404)"],
      host: "harbourdental.example",
      firstSeen: "2026-09-05T03:10:00.000Z",
    },
    {
      priority: "improve",
      label: "Pages without a meta description",
      count: 7,
      examples: ["/treatments/implants", "/treatments/invisalign"],
      host: "harbourdental.example",
      firstSeen: "2026-09-12T03:10:00.000Z",
    },
    {
      priority: "advisory",
      label: "Pages with more than one main heading",
      count: 2,
      examples: ["/contact", "/fees"],
      host: "harbourdental.example",
      firstSeen: "2026-09-26T03:12:00.000Z",
    },
  ],
  findingsTotal: 13,
  openItems: [
    {
      item: "Fix 4 broken links",
      sub: "harbourdental.example",
      since: "2026-09-05T03:10:00.000Z",
      status: "In progress",
    },
    {
      item: "Renew SSL certificate",
      sub: "book.harbourdental.example",
      since: "2026-09-19T12:00:00.000Z",
      status: "Scheduled",
    },
  ],
  dates: [
    {
      date: "2026-10-19T12:00:00.000Z",
      text: "SSL certificate for book.harbourdental.example expires — renewal scheduled",
    },
    { date: "2026-11-28T12:00:00.000Z", text: "SSL certificate for harbourdentalcareers.example expires" },
  ],
  disclosures: ["harbourdentalcareers.example was added on 12 September 2026, so it has no data before then."],
  summary: [
    "Your websites were available 99.99% of the time in September. The main website had one 14-minute outage on 17 September, caused by a server error at the hosting provider; it recovered without data loss.",
    "The latest audit found 4 broken links on the main website, which we are fixing, and 7 pages that would benefit from a meta description.",
    "The booking site’s security certificate renews on 19 October.",
  ],
  noData: false,
};

async function main() {
  const html = renderReportHtml(
    data,
    {
      agencyName: "Northfold Studio",
      color: "#23395B",
      logoDataUri: null,
      contact: "Priya Raman · priya@northfold.example",
      footer: "Northfold Studio · Website care for growing practices",
    },
    { forPdf: false },
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const pages = await page.locator("section.page").all();
  mkdirSync(outDir, { recursive: true });
  for (const [i, name] of Object.entries(SHOTS)) {
    await pages[Number(i)]!.screenshot({ path: `${outDir}/${name}.jpg`, type: "jpeg", quality: 86 });
  }
  await browser.close();
  console.log(`saved ${Object.values(SHOTS).join(", ")} to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
