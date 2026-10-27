import { chromium, type Browser } from "playwright";
import { escapeHtml } from "@/lib/email";

// Controlled HTML-to-PDF (FR-REP-07): JavaScript off, and every request blocked
// except web fonts, so report HTML can't reach anything else.

let browser: Promise<Browser> | null = null;

function getBrowser() {
  browser ??= chromium.launch({ args: ["--disable-dev-shm-usage"] }).catch((error) => {
    browser = null;
    throw error;
  });
  return browser;
}

const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

export async function htmlToPdf(html: string, footer: { code: string }): Promise<Buffer> {
  const context = await (await getBrowser()).newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "data:" || FONT_HOSTS.has(url.hostname)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    // Fonts are a nicety: if they don't arrive in time, render with the fallbacks.
    await page
      .setContent(html, { waitUntil: "networkidle", timeout: 15_000 })
      .catch(() => page.setContent(html, { waitUntil: "load" }));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:8px;color:#4A4F52;width:100%;padding:0 18mm;display:flex;justify-content:space-between"><span>${escapeHtml(footer.code)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      margin: { top: "0", bottom: "14mm", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

export async function closePdfBrowser() {
  if (browser) await (await browser).close().catch(() => undefined);
  browser = null;
}
