// Renders the fictional sample report (lib/reports/fixtures.ts) with the real renderer and saves:
//   public/landing/    — the three page screenshots on the landing page
//   public/templates/  — every page, plus the sample PDF offered on /templates pages
// Re-run after changing the report design or the fixtures: npm run landing:images
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { SAMPLE_AGENCY, SAMPLE_REPORT } from "@/lib/reports/fixtures";
import { closePdfBrowser, htmlToPdf } from "@/lib/reports/pdf";
import { renderReportHtml } from "@/lib/reports/render";

const landingDir = process.argv[2] ?? "public/landing";
const templatesDir = process.argv[3] ?? "public/templates";
/** Report pages shown on the landing page, by position in the report. */
const LANDING_SHOTS: Record<number, string> = { 0: "report-cover", 1: "report-availability", 3: "report-audit" };
/** Every report page for /templates, by position: cover, 01 availability … 05 data notes. */
export const TEMPLATE_PAGES = ["cover", "availability", "speed-security", "audit", "next-steps"] as const;

async function main() {
  const html = renderReportHtml(SAMPLE_REPORT, SAMPLE_AGENCY, { forPdf: false });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const pages = await page.locator("section.page").all();
  mkdirSync(landingDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });
  for (const [i, name] of Object.entries(LANDING_SHOTS)) {
    await pages[Number(i)]!.screenshot({ path: `${landingDir}/${name}.jpg`, type: "jpeg", quality: 86 });
  }
  for (const [i, name] of TEMPLATE_PAGES.entries()) {
    await pages[i]!.screenshot({ path: `${templatesDir}/report-${name}.jpg`, type: "jpeg", quality: 82 });
  }
  await browser.close();

  const pdf = await htmlToPdf(renderReportHtml(SAMPLE_REPORT, SAMPLE_AGENCY, { forPdf: true }), {
    code: SAMPLE_REPORT.code,
  });
  writeFileSync(`${templatesDir}/sample-website-report.pdf`, pdf);
  await closePdfBrowser();
  console.log(`saved landing shots to ${landingDir}, template pages and sample PDF to ${templatesDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
