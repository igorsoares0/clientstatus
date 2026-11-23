import { formatLongDate } from "@/lib/format";
import { summarise, type ReportData, type SiteReport } from "@/lib/reports/aggregate";
import type { Branding } from "@/lib/reports/render";

// Fictional monthly report used for marketing images, the landing page and /templates samples.
// Shaped exactly like lib/reports/aggregate.ts output: the summary comes from summarise(), and
// open items, dates and data notes use the product's own wording, so a sample never shows
// anything the product wouldn't. Names are fictional and domains use the reserved .example TLD.

export const SAMPLE_TZ = "Europe/London";
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

const sites = [mainSite, booking, careers];

const findings: ReportData["findings"] = [
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
];

const day = (iso: string) => formatLongDate(new Date(iso), SAMPLE_TZ);

/** Dates within 90 days of the period end, as aggregate.ts lists them. */
const dates: ReportData["dates"] = sites
  .flatMap((s) =>
    [
      ["SSL certificate expires", s.ssl.expiresAt],
      ["Domain registration expires", s.domain.expiresAt],
    ].flatMap(([what, iso]) =>
      iso && new Date(iso).getTime() - new Date(end).getTime() <= 90 * 86_400_000
        ? [{ date: iso, text: `${what} — ${s.host}` }]
        : [],
    ),
  )
  .sort((a, b) => a.date.localeCompare(b.date));

export const SAMPLE_REPORT: ReportData & { code: string } = {
  version: 1,
  kind: "monthly",
  code: "RPT-0926-HDG",
  client: { name: "Harbour Dental Group", contact: "Dr Amara Okafor" },
  period: { label: "September 2026", start, end, tz: SAMPLE_TZ, days: 30, coveredTo: end, toDate: false },
  previousLabel: "August",
  intervalMinutes: 2,
  generatedAt: "2026-10-01T05:04:00.000Z",
  sites,
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
  findings,
  findingsTotal: findings.reduce((n, f) => n + f.count, 0),
  openItems: [
    { item: "4 audit items to fix", sub: "harbourdental.example", since: mainSite.audit!.date, status: "Open" },
  ],
  dates,
  disclosures: [
    `${careers.host}: monitoring started on ${day(careers.monitoredFrom)} — figures cover ${day(careers.monitoredFrom)} onwards only.`,
    `${careers.host}: the domain registry doesn’t publish an expiry date, so none is shown.`,
  ],
  summary: summarise(sites, findings, "September 2026"),
  noData: false,
};

export const SAMPLE_AGENCY: Branding = {
  agencyName: "Northfold Studio",
  color: "#23395B",
  logoDataUri: null,
  contact: "Priya Raman · priya@northfold.example",
  footer: "Northfold Studio · Website care for growing practices",
};
