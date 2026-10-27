import { brandSummary, DEFAULT_BRAND, isHexColor, normalizeHex } from "@/lib/color";
import { escapeHtml as esc } from "@/lib/email";
import { formatLongDate } from "@/lib/format";
import type { DayState, ReportData, SiteReport } from "@/lib/reports/aggregate";

// Client-facing, white-label monthly report (design screen 7). One HTML
// document for both the PDF and the private web link. Brand colour only
// touches the cover, rules and section numbers; status colours stay fixed.

export type Branding = {
  agencyName: string;
  color: string | null;
  logoDataUri: string | null;
  contact: string | null;
  footer: string | null;
  /** Starter plan (basic branding): a small "Prepared with Client Status" line on the last page. */
  credit?: boolean;
};

const C = {
  ink: "#161A1C",
  ink2: "#2E3437",
  muted: "#4A4F52",
  rule: "#D5D8D4",
  soft: "#F0F1EF",
  up: "#2E7D55",
  down: "#B42318",
  warn: "#8A5A00",
  warnTint: "#FBF3E6",
  gap: "#C9CDC8",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function pctText(p: number | null) {
  if (p === null) return "—";
  if (p < 100 && p >= 99.995) return "99.99%";
  return p === 100 ? "100%" : `${p.toFixed(2)}%`;
}

function minutesText(min: number) {
  if (min === 0) return "None";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ms(n: number | null) {
  return n === null ? "—" : `${n.toLocaleString("en-GB")} ms`;
}

const DAY_COLOR: Record<DayState, string> = { ok: C.up, down: C.down, partial: C.gap, gap: "transparent" };

function dayStrip(s: SiteReport) {
  return `<div class="strip" role="img" aria-label="${esc(`${s.host}: daily availability`)}">${s.days
    .map((d, i) => {
      const style =
        d === "gap"
          ? `background:repeating-linear-gradient(45deg,#8D9396 0 2px,#E2E4E1 2px 4px)`
          : `background:${DAY_COLOR[d]}`;
      return `<span class="day" style="${style}" title="Day ${i + 1}"></span>`;
    })
    .join("")}</div>`;
}

function bars(s: SiteReport, scaleMax: number) {
  const prev = s.prevRespMedian;
  const line =
    prev !== null && scaleMax
      ? `<span class="prevline" style="bottom:${Math.min(100, (prev / scaleMax) * 100)}%"></span>`
      : "";
  return `<div class="bars">${s.dailyMedians
    .map((v) => `<span class="bar" style="height:${v === null ? 0 : Math.max(2, (v / scaleMax) * 100)}%"></span>`)
    .join("")}${line}</div>`;
}

// Screen only (private link and in-app preview): A4 pages reflow on phones.
// Never added to the PDF, whose page is narrower than the breakpoint.
const SCREEN_NARROW_CSS = `
@media (max-width: 820px) {
  .page { width: auto; min-height: 0; margin: 0 0 12px; padding: 24px 16px; }
  .cover { padding-top: 0; }
  .band { padding: 20px 16px; }
  .bandtop { flex-wrap: wrap; }
  .bandperiod { margin-left: 0; text-align: left; width: 100%; }
  .kicker { margin-top: 32px; }
  h1 { font-size: 34px; }
  .coverbody { grid-template-columns: 1fr; }
  .prepared { border-left: 0; padding-left: 0; border-top: 1px solid ${C.rule}; padding-top: 12px; }
  .glancegrid { grid-template-columns: repeat(2, 1fr); }
  table { display: block; overflow-x: auto; }
  .stripwrap, .date, dl.facts { grid-template-columns: 1fr; }
  .incident, .finding, .action, .auditmeta { grid-template-columns: 1fr; gap: 4px; }
}
`;

export function renderReportHtml(data: ReportData, branding: Branding, opts: { forPdf?: boolean } = {}): string {
  const brand = brandSummary(
    branding.color && isHexColor(branding.color) ? normalizeHex(branding.color) : DEFAULT_BRAND,
  );
  const tz = data.period.tz;
  const month = data.period.label.split(" ")[0];
  const code = esc((data as ReportData & { code?: string }).code ?? "");
  const agency = esc(branding.agencyName);
  const client = esc(data.client.name);
  const startD = new Date(data.period.start);
  const coveredTo = new Date(data.period.coveredTo);
  const lastDay = new Date(coveredTo.getTime() - 1);
  const rangeText = `${formatLongDate(startD, tz).replace(/ \d{4}$/, "")}–${formatLongDate(lastDay, tz)}`;

  const totalSuccess = data.sites.reduce(
    (n, s) => n + (s.uptimePct !== null ? (s.uptimePct / 100) * s.conclusive : 0),
    0,
  );
  const totalConclusive = data.sites.reduce((n, s) => n + s.conclusive, 0);
  const overall = totalConclusive ? (totalSuccess / totalConclusive) * 100 : null;
  const prevAll =
    data.sites.every((s) => s.prevUptimePct !== null) && data.sites.length
      ? data.sites.reduce((n, s) => n + s.prevUptimePct!, 0) / data.sites.length
      : null;
  const downtime = data.sites.reduce((n, s) => n + s.downtimeMinutes, 0);
  const medians = data.sites.map((s) => s.respMedian).filter((v): v is number => v !== null);
  const typical = medians.length ? Math.round(medians.reduce((a, b) => a + b, 0) / medians.length) : null;
  const fix = data.findings.filter((f) => f.priority === "fix").reduce((n, f) => n + f.count, 0);
  const glance = [
    {
      v: pctText(overall),
      l: "Uptime",
      s: "checks passed",
      cmp: prevAll !== null ? `${data.previousLabel} ${pctText(prevAll)}` : "",
    },
    {
      v: minutesText(downtime),
      l: "Confirmed downtime",
      s: downtime
        ? plural(data.incidents.filter((i) => i.title.startsWith("Website down")).length, "outage")
        : "no outages",
      cmp: "",
    },
    { v: ms(typical), l: "Typical response", s: "server response", cmp: "" },
    { v: String(fix), l: "To fix", s: fix ? "from the latest audit" : "nothing urgent", cmp: "" },
  ];
  const scaleMax = Math.max(
    500,
    ...data.sites.flatMap((s) => [...s.dailyMedians.filter((v): v is number => v !== null), s.prevRespMedian ?? 0]),
  );

  const logo = branding.logoDataUri
    ? `<span class="plate"><img src="${esc(branding.logoDataUri)}" alt="${agency}"></span>`
    : `<span class="mark">${esc(initials(branding.agencyName))}</span>`;
  const runningHead = `<div class="runhead"><span class="strong">${agency}</span><span>${client} · ${esc(data.period.label)}</span></div>`;
  const sectionHead = (n: string, title: string, intro?: string) =>
    `<div class="sechead"><span class="num">${n}</span><h2>${esc(title)}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ""}</div>`;

  const sitesLine =
    data.sites.length === 1
      ? esc(data.sites[0].host)
      : `${data.sites.length} websites · ${data.sites.map((s) => esc(s.host)).join(", ")}`;
  const relIntro =
    downtime === 0
      ? `Every website passed our availability checks in ${month}. Checks that didn’t run are left out, never counted as up.`
      : `${data.sites
          .filter((s) => s.downtimeMinutes)
          .map((s) => `${s.name} had ${minutesText(s.downtimeMinutes)} of confirmed downtime`)
          .join("; ")}. Everything else passed our checks.`;

  const availability = data.sites
    .map(
      (s) => `<tr>
  <td><span class="strong">${esc(s.name)}</span><span class="mono">${esc(s.host)}</span></td>
  <td class="r big">${pctText(s.uptimePct)}</td>
  <td class="r muted">${s.prevUptimePct === null ? "—" : pctText(s.prevUptimePct)}</td>
  <td class="r">${minutesText(s.downtimeMinutes)}</td>
  <td class="r"><span>${s.coveragePct === null ? "—" : `${s.coveragePct.toFixed(1)}%`}</span><span class="sub">${s.completed.toLocaleString("en-GB")} of ${s.expected.toLocaleString("en-GB")} checks</span></td>
</tr>`,
    )
    .join("");

  const incidents = data.incidents.length
    ? data.incidents
        .map((i) => {
          const d = new Date(i.start);
          return `<div class="incident"><span><span class="strong">${esc(formatLongDate(d, tz))}</span></span><span><span class="strong">${esc(i.title)}</span><span class="mono">${esc(i.host)}</span></span><span class="r"><span class="${i.resolved ? "ok" : "bad"}">${i.resolved ? "● Resolved" : "◆ Ongoing"}</span><span class="sub">${minutesText(i.minutes)}</span></span></div>`;
        })
        .join("")
    : `<p class="muted">No confirmed incidents in ${esc(month)}.</p>`;

  const speed = data.sites
    .map(
      (s) => `<div class="speed">
  <div class="speedhead"><span class="strong">${esc(s.name)}</span><span>Typical <b>${ms(s.respMedian)}</b></span><span>Slowest 5% <b>${ms(s.respP95)}</b></span><span class="muted">${esc(data.previousLabel)} typical ${ms(s.prevRespMedian)}</span></div>
  ${bars(s, scaleMax)}
</div>`,
    )
    .join("");

  const sslRows = data.sites
    .map((s) => {
      const glyph =
        s.ssl.status === "invalid"
          ? `<span class="bad">◆ Problem</span>`
          : s.ssl.status === "expiring"
            ? `<span class="warn">▲ Renewal due</span>`
            : s.ssl.status === "valid"
              ? `<span class="ok">● Valid</span>`
              : `<span class="muted">${s.ssl.status === "none" ? "None" : "Not checked"}</span>`;
      const sslSub = s.ssl.expiresAt ? `Expires ${formatLongDate(new Date(s.ssl.expiresAt), tz)}` : esc(s.ssl.detail);
      const dom = s.domain.expiresAt
        ? `Registered until ${formatLongDate(new Date(s.domain.expiresAt), tz)}`
        : s.domain.status === "unsupported"
          ? "n/a — not published by registry"
          : "Not checked";
      return `<tr><td class="mono">${esc(s.host)}</td><td>${glyph}<span class="sub">${sslSub}</span></td><td><span class="${s.domain.status === "expiring" ? "warn" : ""}">${esc(dom)}</span><span class="sub">${s.domain.source ? `Source: ${esc(s.domain.source)}` : ""}</span></td></tr>`;
    })
    .join("");

  const audits = data.sites
    .filter((s) => s.audit)
    .map(
      (s) =>
        `<div class="auditmeta"><span class="mono">${esc(s.host)}</span><span>${esc(formatLongDate(new Date(s.audit!.date), tz))}</span><span>${s.audit!.status === "partial" ? `<span class="warn">Partial</span>` : "Complete"}</span><span>${s.audit!.pages.toLocaleString("en-GB")} pages of ${s.audit!.budget.toLocaleString("en-GB")} · ${s.audit!.links.toLocaleString("en-GB")} links</span></div>${s.audit!.reasons.map((r) => `<p class="callout">▲ ${esc(r)}</p>`).join("")}`,
    )
    .join("");
  const PRIO = {
    fix: `<span class="bad">▲ Fix</span>`,
    improve: `<span class="mid">● Improve</span>`,
    advisory: `<span class="muted">○ Advisory</span>`,
  };
  const findings = data.findings.length
    ? data.findings
        .map(
          (f) =>
            `<div class="finding"><span>${PRIO[f.priority]}</span><span><span class="strong">${esc(f.label)}${f.count > 1 ? ` · ${f.count}` : ""}</span><span class="sub">${f.examples.map(esc).join("<br>")}${f.count > f.examples.length ? `<br>and ${f.count - f.examples.length} more` : ""}</span></span><span class="mono">${esc(f.host)}</span></div>`,
        )
        .join("")
    : `<p class="muted">${data.sites.some((s) => s.audit) ? "The latest audit found nothing to fix." : "No audit has finished yet, so there are no findings to report."}</p>`;
  const firstSeen = data.findings.map((f) => f.firstSeen).sort();
  const timing = firstSeen.length
    ? `These were first found between ${formatLongDate(new Date(firstSeen[0]), tz)} and ${formatLongDate(new Date(firstSeen.at(-1)!), tz)}. Audits run on a schedule, so we can’t say exactly when each problem started.`
    : "";

  const openItems = data.openItems.length
    ? data.openItems
        .map(
          (a) =>
            `<div class="action"><span><span class="strong">${esc(a.item)}</span><span class="mono">${esc(a.sub)}</span></span><span>${esc(a.status)}</span><span class="r">since ${esc(formatLongDate(new Date(a.since), tz))}</span></div>`,
        )
        .join("")
    : `<p class="muted">Nothing is open at the end of ${esc(month)}.</p>`;
  const dates = data.dates.length
    ? data.dates
        .map(
          (d) =>
            `<div class="date"><span class="strong">${esc(formatLongDate(new Date(d.date), tz))}</span><span>${esc(d.text)}</span></div>`,
        )
        .join("")
    : `<p class="muted">No renewals due in the next 90 days.</p>`;
  const disclosures = data.disclosures.length
    ? `<ul class="disclosures">${data.disclosures.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
    : `<p class="muted">Monitoring and audit coverage were complete for this period.</p>`;

  const generated = new Date(data.generatedAt);
  const fresh = [
    ["Period", `${rangeText} (${tz})`],
    ["Check interval", `Every ${data.intervalMinutes} minute${data.intervalMinutes === 1 ? "" : "s"}`],
    ["Uptime", "Successful ÷ completed conclusive checks; inconclusive and missing checks are left out"],
    ["Certificates & domains", "Checked every 6 hours and daily; registry data via RDAP"],
    ["Generated", `${formatLongDate(generated, tz)}`],
  ];

  const css = `
@page { size: A4; margin: 0 0 14mm 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Archivo, "Helvetica Neue", Arial, sans-serif; color: ${C.ink}; font-size: 14.5px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: ${opts.forPdf ? "#fff" : "#EEF0EE"}; }
.page { background: #fff; width: 210mm; margin: ${opts.forPdf ? "0" : "24px auto"}; padding: 16mm 18mm 12mm; ${opts.forPdf ? "" : "box-shadow: 0 1px 3px rgba(0,0,0,.12); min-height: 297mm;"} break-after: page; }
.page:last-child { break-after: auto; }
.cover { padding-top: 14mm; }
.band { background: ${brand.cover}; color: ${brand.coverText}; padding: 12mm 12mm 11mm; }
.bandtop { display: flex; align-items: center; gap: 12px; }
.mark { width: 42px; height: 42px; border: 1.5px solid ${brand.coverText}; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; letter-spacing: .02em; }
.plate { background: #fff; padding: 6px 10px; display: inline-flex; align-items: center; height: 46px; }
.plate img { max-height: 34px; max-width: 160px; }
.agency { font-weight: 700; font-size: 16px; }
.bandperiod { margin-left: auto; text-align: right; font-size: 13px; line-height: 1.5; }
.kicker { margin-top: 18mm; font-size: 13px; letter-spacing: .1em; }
h1 { margin: 2mm 0 1mm; font-size: 46px; line-height: 1.05; font-weight: 600; font-stretch: 82%; }
.siteline { font-size: 15px; }
.coverbody { display: grid; grid-template-columns: 1fr 190px; gap: 10mm; margin-top: 10mm; }
.label { font-size: 12.5px; letter-spacing: .08em; font-weight: 700; color: ${brand.onWhite}; margin: 0 0 3mm; }
.coverbody p { margin: 0 0 3mm; font-size: 16px; line-height: 1.55; }
.prepared { border-left: 1px solid ${C.rule}; padding-left: 6mm; font-size: 13px; display: flex; flex-direction: column; gap: 1mm; }
.prepared b { font-size: 13.5px; margin-bottom: 3mm; }
.glance { margin-top: 10mm; border-top: 2px solid ${brand.onWhite}; padding-top: 5mm; }
.glancegrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
.g .v { display: block; font-size: 28px; font-weight: 600; font-stretch: 85%; font-variant-numeric: tabular-nums; }
.g .l { display: block; font-weight: 700; font-size: 13px; }
.g .s, .g .c { display: block; font-size: 12.5px; color: ${C.muted}; }
.note { margin-top: 6mm; padding: 3mm 4mm; background: ${C.warnTint}; color: #3A2A14; font-size: 13px; }
.runhead { display: flex; justify-content: space-between; font-size: 12.5px; color: ${C.muted}; border-bottom: 1px solid ${C.ink}; padding-bottom: 2mm; margin-bottom: 7mm; }
.strong { font-weight: 700; color: ${C.ink}; }
.sechead { margin-bottom: 6mm; }
.num { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px; color: ${brand.onWhite}; }
h2 { margin: 1mm 0 2mm; font-size: 30px; font-weight: 600; font-stretch: 85%; line-height: 1.15; }
h3 { margin: 8mm 0 3mm; font-size: 17px; font-weight: 700; }
.intro { margin: 0; color: ${C.ink2}; font-size: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th { text-align: left; font-size: 12px; letter-spacing: .06em; color: ${C.muted}; font-weight: 700; border-bottom: 1.5px solid ${C.ink}; padding: 2mm 2mm 2mm 0; }
td { border-bottom: 1px solid ${C.rule}; padding: 3mm 2mm 3mm 0; vertical-align: top; }
td span { display: block; }
.r { text-align: right; } th.r { text-align: right; }
.big { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: ${C.muted}; }
.muted { color: ${C.muted}; }
.sub { font-size: 12px; color: ${C.muted}; }
.ok { color: ${C.up}; font-weight: 600; } .bad { color: ${C.down}; font-weight: 600; } .warn { color: ${C.warn}; font-weight: 600; } .mid { color: ${C.ink}; font-weight: 600; }
.stripwrap { display: grid; grid-template-columns: 150px 1fr; gap: 4mm; align-items: center; margin-bottom: 2.5mm; font-size: 12.5px; }
.stripwrap .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finding .mono, .incident .mono, .action .mono, td.mono { overflow-wrap: anywhere; }
.strip { display: flex; gap: 1.5px; height: 18px; }
.day { flex: 1; }
.legend { display: flex; gap: 6mm; font-size: 12px; color: ${C.muted}; margin-top: 2mm; }
.sw { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px; }
.incident, .finding, .action { display: grid; grid-template-columns: 110px 1fr 120px; gap: 4mm; padding: 3mm 0; border-bottom: 1px solid ${C.rule}; font-size: 13.5px; }
.incident span span, .finding span span, .action span span { display: block; }
.how { margin-top: 8mm; font-size: 12.5px; color: ${C.muted}; }
.speed { margin-bottom: 6mm; }
.speedhead { display: flex; flex-wrap: wrap; gap: 6mm; font-size: 13px; margin-bottom: 2mm; }
.bars { position: relative; display: flex; align-items: flex-end; gap: 2px; height: 70px; border-bottom: 1px solid ${C.ink}; }
.bar { flex: 1; background: ${brand.onWhite}; opacity: .85; }
.prevline { position: absolute; left: 0; right: 0; border-top: 1.5px dashed ${C.muted}; }
.auditmeta { display: grid; grid-template-columns: 1.3fr 1fr .8fr 1.6fr; gap: 3mm; padding: 2.5mm 0; border-bottom: 1px solid ${C.rule}; font-size: 13px; }
.callout { margin: 2mm 0; padding: 2.5mm 3.5mm; background: ${C.warnTint}; color: #3A2A14; font-size: 12.5px; }
.finding { grid-template-columns: 100px 1fr 150px; }
.keys { display: flex; flex-wrap: wrap; gap: 6mm; font-size: 12px; color: ${C.muted}; margin-top: 4mm; }
.disclaimer { margin-top: 5mm; font-size: 12.5px; color: ${C.muted}; }
.action { grid-template-columns: 1fr 130px 120px; }
.date { display: grid; grid-template-columns: 130px 1fr; gap: 4mm; padding: 2.5mm 0; border-bottom: 1px solid ${C.rule}; font-size: 13.5px; }
.disclosures { margin: 0 0 4mm; padding-left: 5mm; font-size: 13px; color: ${C.ink2}; }
.disclosures li { margin-bottom: 1.5mm; }
dl.facts { display: grid; grid-template-columns: 150px 1fr; gap: 1.5mm 5mm; margin: 0; font-size: 13px; }
dl.facts dt { color: ${C.muted}; } dl.facts dd { margin: 0; }
.contact { margin-top: 8mm; border: 1px solid ${C.rule}; border-left: 3px solid ${brand.onWhite}; padding: 4mm 5mm; font-size: 13.5px; }
.footline { margin-top: 8mm; display: flex; justify-content: space-between; font-size: 11.5px; color: ${C.muted}; }
${opts.forPdf ? "" : SCREEN_NARROW_CSS}`;

  const footerLine = esc(branding.footer ?? "");
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${client} · Website health report · ${esc(data.period.label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${css}</style></head><body>
<section class="page cover">
  <div class="band">
    <div class="bandtop">${logo}<span class="agency">${agency}</span><span class="bandperiod">${esc(data.period.label)}<br>${esc(rangeText)} · ${esc(tz)}</span></div>
    <div class="kicker">WEBSITE HEALTH REPORT${data.kind === "preview" ? " · PREVIEW" : ""}</div>
    <h1>${client}</h1>
    <div class="siteline">${sitesLine}</div>
  </div>
  <div class="coverbody">
    <div><p class="label">SUMMARY</p>${data.summary.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
    <div class="prepared"><span>Prepared for</span><b>${esc(data.client.contact ?? data.client.name)}</b><span>Prepared by</span><b>${agency}</b><span>Report</span><b class="mono">${code}</b></div>
  </div>
  <div class="glance"><p class="label">${esc(month.toUpperCase())} AT A GLANCE</p>
    <div class="glancegrid">${glance.map((g) => `<div class="g"><span class="v">${esc(g.v)}</span><span class="l">${esc(g.l)}</span><span class="s">${esc(g.s)}</span>${g.cmp ? `<span class="c">${esc(g.cmp)}</span>` : ""}</div>`).join("")}</div>
    ${data.disclosures.length ? `<p class="note">▲ Some data for this period is incomplete. Each gap is listed in “About this report’s data” — nothing is estimated.</p>` : ""}
  </div>
  ${footerLine ? `<div class="footline"><span>${footerLine}</span></div>` : ""}
</section>
<section class="page">
  ${runningHead}
  ${sectionHead("01", "Was the website available?", relIntro)}
  <table><thead><tr><th>WEBSITE</th><th class="r">UPTIME</th><th class="r">${esc(data.previousLabel.toUpperCase())}</th><th class="r">CONFIRMED DOWNTIME</th><th class="r">COVERAGE</th></tr></thead><tbody>${availability}</tbody></table>
  <h3>Day by day</h3>
  ${data.sites.map((s) => `<div class="stripwrap"><span class="mono" title="${esc(s.host)}">${esc(s.host)}</span>${dayStrip(s)}</div>`).join("")}
  <div class="legend"><span><span class="sw" style="background:${C.up}"></span>All checks passed</span><span><span class="sw" style="background:${C.down}"></span>Confirmed downtime</span><span><span class="sw" style="background:${C.gap}"></span>Some checks not run or inconclusive</span><span><span class="sw" style="background:repeating-linear-gradient(45deg,#8D9396 0 2px,#E2E4E1 2px 4px)"></span>Not monitored</span></div>
  <h3>Confirmed incidents</h3>
  ${incidents}
  <p class="how"><b>How we measure this.</b> We check each website every ${data.intervalMinutes} minute${data.intervalMinutes === 1 ? "" : "s"}. Uptime is successful checks ÷ completed, conclusive checks. Checks that didn’t run or were inconclusive (timeouts, rate limits, bot protection) are left out, never counted as “up”. Downtime counts only once two checks in a row have failed, so a single blip isn’t an outage.</p>
</section>
<section class="page">
  ${runningHead}
  ${sectionHead("02", "Was it fast and secure?", "How quickly each server responded to our checks, and the state of its security certificate and domain registration.")}
  ${speed}
  <p class="sub">Bars show the daily median response time of successful checks; the dashed line is ${esc(data.previousLabel)}’s typical time. This measures server response, not full page-load time in a visitor’s browser.</p>
  <h3>Security certificate and domain</h3>
  <table><thead><tr><th>WEBSITE</th><th>SSL CERTIFICATE</th><th>DOMAIN REGISTRATION</th></tr></thead><tbody>${sslRows}</tbody></table>
  <p class="sub">Expiry dates come from the certificate itself and from the domain registry (RDAP). Where a registry doesn’t publish a date we say so rather than estimate one.</p>
</section>
<section class="page">
  ${runningHead}
  ${sectionHead("03", "What did the latest audit find?", "Our crawler checks each website’s pages and links on a schedule. These are the findings from the most recent audit.")}
  ${audits || `<p class="muted">No audit has finished yet.</p>`}
  <h3>Findings</h3>
  ${findings}
  ${timing ? `<p class="sub"><b>When these appeared.</b> ${esc(timing)}</p>` : ""}
  <div class="keys"><span><span class="bad">▲ Fix</span> affects visitors now</span><span><span class="mid">● Improve</span> affects how search engines list you</span><span><span class="muted">○ Advisory</span> worth reviewing, not an error</span></div>
  <p class="disclaimer">These are basic technical checks — broken links, page titles, descriptions, headings and canonical tags. They are not a full SEO audit and don’t predict search rankings.</p>
</section>
<section class="page">
  ${runningHead}
  ${sectionHead("04", "What happens next")}
  ${openItems}
  <h3>Dates to know</h3>
  ${dates}
  <div style="margin-top:10mm">${sectionHead("05", "About this report’s data")}</div>
  ${disclosures}
  <dl class="facts">${fresh.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
  <div class="contact"><span class="strong">Questions about this report?</span><br>${esc(branding.contact ?? branding.agencyName)}</div>
  <div class="footline"><span class="mono">${code}</span><span>${footerLine || (branding.credit ? "Prepared with Client Status" : "")}</span></div>
</section>
</body></html>`;
}
