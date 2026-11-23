import { expect, test } from "@playwright/test";

// SEO pages (docs/pseo-plan.md): each directory's hub and one detail page render for an anonymous
// visitor with a 200, the right <title>, an absolute canonical and no redirect to /sign-in.

const PAGES: { path: string; title: RegExp }[] = [
  { path: "/alternatives", title: /^Alternatives to uptime and WordPress tools · Client Status$/ },
  { path: "/alternatives/oh-dear", title: /^Oh Dear alternative for agencies · Client Status$/ },
  { path: "/compare", title: /^Client Status vs other monitoring tools$/ },
  { path: "/compare/client-status-vs-uptimerobot", title: /^Client Status vs UptimeRobot: agency comparison$/ },
  { path: "/tools", title: /^Free website tools for agencies · Client Status$/ },
  { path: "/tools/ssl-checker", title: /^Free SSL certificate checker · Client Status$/ },
  { path: "/domain-expiry", title: /^Domain expiry lookup by TLD · Client Status$/ },
  { path: "/domain-expiry/com", title: /^\.com domain expiry checker · Client Status$/ },
  { path: "/templates", title: /^Client report templates for agencies · Client Status$/ },
  { path: "/templates/uptime-report-template", title: /^Uptime report template for clients · Client Status$/ },
  { path: "/for", title: /^Website monitoring by platform · Client Status$/ },
  { path: "/for/wordpress", title: /^Website monitoring for WordPress sites · Client Status$/ },
  { path: "/errors", title: /^Website error glossary for agencies · Client Status$/ },
  { path: "/errors/err-cert-date-invalid", title: /^NET::ERR_CERT_DATE_INVALID: causes and fixes · Client Status$/ },
];

for (const p of PAGES) {
  test(`${p.path} is public and indexable`, async ({ page }) => {
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(p.path);
    await expect(page).toHaveTitle(p.title);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(new RegExp(`^https://[^/]+${p.path}$`));
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });
}

test("unknown competitor pages are 404s, not redirects", async ({ page }) => {
  const res = await page.goto("/alternatives/not-a-real-tool");
  expect(res?.status()).toBe(404);
  const cmp = await page.goto("/compare/client-status-vs-not-a-real-tool");
  expect(cmp?.status()).toBe(404);
});

test("the sample report PDF downloads", async ({ request }) => {
  const res = await request.get("/templates/sample-website-report.pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
});

test("TLDs without an RDAP server render but stay out of search", async ({ page }) => {
  const res = await page.goto("/domain-expiry/de");
  expect(res?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  expect((await page.goto("/domain-expiry/notatld"))?.status()).toBe(404);
});

test("the SSL checker refuses private addresses from the page", async ({ page }) => {
  await page.goto("/tools/ssl-checker");
  await page.getByLabel("Website").fill("http://127.0.0.1");
  await page.getByRole("button", { name: "Check certificate" }).click();
  await expect(page.getByText(/blocked for safety/)).toBeVisible();
});

test("section sitemaps and robots.txt list the pages", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("/alternatives/sitemap.xml");
  expect(robots).toContain("/compare/sitemap.xml");
  expect(robots).toContain("/tools/sitemap.xml");
  expect(robots).toContain("/domain-expiry/sitemap.xml");
  expect(robots).toContain("/templates/sitemap.xml");
  expect(robots).toContain("/for/sitemap.xml");
  const alt = await request.get("/alternatives/sitemap.xml");
  expect(alt.status()).toBe(200);
  expect(await alt.text()).toContain("/alternatives/oh-dear</loc>");
});
