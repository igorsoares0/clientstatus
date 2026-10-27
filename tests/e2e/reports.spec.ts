import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import "dotenv/config";
import { onboard, visible } from "./helpers";

/** Runs queued jobs of the given types once, like the worker would. */
function runJobs(...types: string[]) {
  execFileSync("npx", ["tsx", "--env-file=.env", "scripts/run-jobs-once.ts", ...types], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BETTER_AUTH_URL: "http://localhost:3100",
      EMAIL_DELIVERY: "mailbox",
    },
    stdio: "pipe",
    timeout: 120_000,
  });
}

/** Some uptime history for the current month, so the preview has data. */
async function seedChecks(email: string) {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT s.id, s."workspaceId" FROM site s JOIN workspace_member m ON m."workspaceId" = s."workspaceId" JOIN "user" u ON u.id = m."userId" WHERE u.email = $1`,
      [email],
    );
    // The site "started" two hours ago, so these checks fall inside its monitored window.
    await db.query(`UPDATE site SET "createdAt" = now() - interval '2 hours' WHERE id = $1`, [rows[0].id]);
    for (let i = 1; i <= 30; i++) {
      await db.query(
        `INSERT INTO monitor_check (id, "workspaceId", "siteId", "checkType", status, "checkedAt", "durationMs", summary, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'uptime', 'success', now() - ($3 || ' minutes')::interval, 240, 'HTTP 200 OK · 240 ms', now())`,
        [rows[0].workspaceId, rows[0].id, String(i * 2)],
      );
    }
  } finally {
    await db.end();
  }
}

function lastMailTo(to: string) {
  const lines = readFileSync(".dev-mailbox/emails.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string; attachments?: string[] });
  return lines.filter((m) => m.to === to).at(-1);
}

test("preview report: generate, review gaps, confirm recipients, send, open the private link, revoke it", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const email = await onboard(page);
  await page.getByLabel("Website address").filter(visible).fill("harbourdental.co.uk");
  await page
    .getByLabel(/^Client/)
    .filter(visible)
    .fill("Harbour Dental Group");
  await page.getByRole("button", { name: "Start monitoring" }).filter(visible).click();
  await expect(page.getByText("awaiting first check").first()).toBeVisible();
  await seedChecks(email);

  // Client page: add a recipient and ask for a preview.
  await page.goto("/clients");
  await page.getByRole("link", { name: "Harbour Dental Group" }).filter(visible).click();
  const recipients = page.getByRole("region", { name: "Report recipients" });
  await recipients.getByLabel("Email").fill("sarah@harbour.example");
  await recipients.getByRole("button", { name: "Add recipient" }).click();
  await expect(recipients.getByText("Not yet confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Generate preview now" }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+$/);
  await expect(page.getByText(/being generated/)).toBeVisible();

  runJobs("report_generate");
  await page.reload();
  const review = page.getByRole("complementary", { name: "Review" });
  await expect(review.getByRole("heading", { name: "1 · Data gaps" })).toBeVisible();
  await expect(page.locator('iframe[title="Report preview"]')).toBeVisible();
  const pdf = await page.request.get(
    await page
      .getByRole("link", { name: "Download PDF" })
      .getAttribute("href")
      .then((h) => h!),
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // Send is blocked until every gap is reviewed and the first delivery is confirmed.
  const send = review.getByRole("button", { name: /^Send preview to 1 recipient$/ });
  await expect(send).toBeDisabled();
  await expect(review.getByText(/To send: review \d+ data gaps?/)).toBeVisible();
  for (const box of await review.getByRole("region", { name: "1 · Data gaps" }).getByRole("checkbox").all())
    await box.check();
  await expect(review.getByText(/confirm the recipients for the first delivery/)).toBeVisible();
  await review.getByLabel(/First delivery for this client/).check();
  await expect(send).toBeEnabled();
  await send.click();
  const linkInput = review.getByRole("textbox", { name: "Private report link" });
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);

  runJobs("email_send");
  const mail = lastMailTo("sarah@harbour.example");
  expect(mail?.subject).toMatch(/^Harbour Dental Group — website health report, /);
  expect(mail?.text).toContain(link);
  expect(mail?.attachments?.[0]).toMatch(/harbour-dental-group-.*-website-health\.pdf$/);

  // The private link works without signing in.
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  const res = await pub.goto(link);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
  // The app-wide headers in next.config.ts must not replace the report's own, stricter policy.
  expect(res?.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(res?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(pub.getByRole("heading", { level: 1, name: "Harbour Dental Group" })).toBeVisible();
  await expect(pub.getByText(/WEBSITE HEALTH REPORT · PREVIEW/)).toBeVisible();
  expect((await pub.request.get(`${link}/pdf`)).headers()["content-type"]).toBe("application/pdf");

  // Revoke it from the report page.
  await page.reload();
  const delivery = page.getByRole("complementary", { name: "Delivery" });
  await expect(delivery.getByText("sarah@harbour.example")).toBeVisible();
  await delivery.getByRole("button", { name: "Revoke…" }).click();
  await delivery.getByRole("region", { name: "Confirm revoke" }).getByRole("button", { name: "Revoke link" }).click();
  await expect(delivery.getByText("Revoked — it no longer opens.")).toBeVisible();
  await pub.goto(link);
  await expect(pub.getByRole("heading", { name: "This report link isn’t available" })).toBeVisible();
  await anon.close();

  // Recipient is now confirmed on the client page; the report shows in the history.
  await page.goto("/reports");
  await expect(page.locator("table").filter(visible).getByText("Sent")).toBeVisible();
});

test("settings: alert recipients are required, branding updates the cover preview", async ({ page }) => {
  await onboard(page);
  await page.goto("/settings");
  const recipientBox = page.getByRole("region", { name: "Who gets alert emails" }).getByRole("checkbox");
  await expect(recipientBox).toBeChecked(); // owner by default
  await recipientBox.uncheck();
  await expect(page.getByText("▲ Nobody will be emailed about downtime. Select at least one person.")).toBeVisible();
  const bar = page.getByRole("region", { name: "Unsaved changes" });
  await expect(bar.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await recipientBox.check();
  await page.getByLabel("SSL certificate expiring: email when opened").uncheck();
  await page.getByLabel(/Minimum time between emails/).selectOption("0");
  await expect(page.getByText(/One email when an incident opens and one when it resolves/)).toBeVisible();
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Alert settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("SSL certificate expiring: email when opened")).not.toBeChecked();

  await page.getByRole("tab", { name: "Report branding" }).click();
  await page.getByLabel("Hex").fill("#F5D547");
  await expect(page.getByText(/Cover text contrast .* passes AA \(dark text\)/)).toBeVisible();
  await page.getByLabel("Hex").fill("blue");
  await expect(page.getByText("Use a hex colour like #23395B.", { exact: true })).toBeVisible();
  await page.getByLabel("Hex").fill("#1F5F4A");
  await page.getByLabel("Footer line").fill("hello@northfold.studio · northfold.studio");
  await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Branding saved/)).toBeVisible();

  // A tiny valid PNG.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d4944415478da63f8cfc0f01f0005000201" +
      "a5f6a8b50000000049454e44ae426082",
    "hex",
  );
  await page.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Logo uploaded")).toBeVisible();
  await expect(page.getByRole("img", { name: "Current logo" })).toBeVisible();
  await page
    .getByLabel("Logo file")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("notes.txt isn’t a PNG or SVG file.")).toBeVisible();

  await page.getByRole("tab", { name: "Report schedule" }).click();
  await expect(page.getByLabel(/Hold every report for review/)).toBeChecked();
});
