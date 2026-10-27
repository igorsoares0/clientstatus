import { expect, test } from "@playwright/test";
import { Client } from "pg";
import "dotenv/config";
import { onboard, visible } from "./helpers";

/** Simulates what the worker would record: a site that went down 7 minutes ago, with an open incident. */
async function seedDowntime(email: string, hostname: string) {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT s.id AS "siteId", s."workspaceId" FROM site s
       JOIN workspace_member m ON m."workspaceId" = s."workspaceId"
       JOIN "user" u ON u.id = m."userId"
       WHERE u.email = $1 AND s."normalizedHostname" = $2`,
      [email, hostname],
    );
    const { siteId, workspaceId } = rows[0];
    await db.query(
      `UPDATE site_state SET "liveStatus" = 'down', "statusRank" = 0, "statusDetail" = 'HTTP 502 Bad Gateway · 90 ms',
         "statusSince" = now() - interval '7 minutes', "lastCheckAt" = now() - interval '20 seconds', "consecutiveFailures" = 3,
         "nextCheckAt" = now() + interval '100 seconds', "sslState" = 'expiring', "sslExpiresAt" = now() + interval '6 days 2 hours',
         "sslIssuer" = 'Let''s Encrypt', "sslDetail" = 'Valid (Let''s Encrypt) · expires in 6 days', "sslCheckedAt" = now()
       WHERE "siteId" = $1`,
      [siteId],
    );
    const checks: [string, string, number | null, string][] = [
      ["9 minutes", "success", 200, "HTTP 200 OK · 262 ms"],
      ["7 minutes", "failure", 502, "HTTP 502 Bad Gateway · 88 ms"],
      ["6 minutes", "failure", 502, "HTTP 502 Bad Gateway · 90 ms"],
      ["4 minutes", "inconclusive", null, "Timed out after 10 s — excluded from failure count"],
      ["20 seconds", "failure", 502, "HTTP 502 Bad Gateway · 90 ms"],
    ];
    for (const [ago, status, code, summary] of checks) {
      await db.query(
        `INSERT INTO monitor_check (id, "workspaceId", "siteId", "checkType", status, "checkedAt", "httpStatusCode", summary, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'uptime', $3::"CheckStatus", now() - $4::interval, $5, $6, now())`,
        [workspaceId, siteId, status, ago, code, summary],
      );
    }
    await db.query(`UPDATE workspace SET "incidentSeq" = 412 WHERE id = $1`, [workspaceId]);
    const inc = await db.query(
      `INSERT INTO incident (id, "workspaceId", "siteId", number, type, severity, status, title, summary, "firstDetectedAt", "lastDetectedAt", "openKey", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, 412, 'downtime', 'critical', 'open', 'Website down — HTTP 502 Bad Gateway', 'HTTP 502 Bad Gateway · 90 ms',
               now() - interval '6 minutes', now() - interval '20 seconds', $2 || ':downtime', now(), now()) RETURNING id`,
      [workspaceId, siteId],
    );
    await db.query(
      `INSERT INTO incident_event (id, "workspaceId", "incidentId", "eventType", detail, "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'opened', 'Opened after 2 consecutive failed checks', now() - interval '6 minutes')`,
      [workspaceId, inc.rows[0].id],
    );
    return { siteId };
  } finally {
    await db.end();
  }
}

test("a confirmed outage shows everywhere and can be acknowledged, muted and annotated", async ({ page }) => {
  const email = await onboard(page);
  await page.getByLabel("Website address").filter(visible).fill("harbourdental.co.uk");
  await page
    .getByLabel(/^Client/)
    .filter(visible)
    .fill("Harbour Dental Group");
  await page.getByRole("button", { name: "Start monitoring" }).filter(visible).click();
  await expect(page.getByText("awaiting first check").first()).toBeVisible();
  await seedDowntime(email, "harbourdental.co.uk");

  // Overview: ranked attention list.
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /1 of 1 websites at risk\./ })).toBeVisible();
  const attention = page.getByRole("region", { name: /Needs attention/ });
  const items = attention.getByRole("listitem");
  await expect(items.first()).toContainText("Website down — HTTP 502 Bad Gateway");
  await expect(items.nth(1)).toContainText("SSL certificate expires in 6 days");
  await expect(page.getByRole("link", { name: "1 not acknowledged", exact: true })).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Primary" }).filter(visible);
  await expect(sidebar.getByRole("link", { name: /Incidents\s*1 not acknowledged/ })).toBeVisible();

  // Websites table.
  await page.goto("/websites");
  const row = page
    .locator("table")
    .filter(visible)
    .getByRole("row", { name: /harbourdental/ });
  await expect(row.getByText("Down")).toBeVisible();
  await expect(row.getByText("6 d")).toBeVisible();
  await expect(row.getByRole("link", { name: "1 open incident" })).toBeVisible();

  // Incidents: acknowledge with undo, mute with confirmation, unmute, note, history filter.
  await row.getByRole("link", { name: "1 open incident" }).click();
  await expect(page.getByRole("heading", { name: /Needs acknowledgment/ })).toBeVisible();
  await page.getByRole("link", { name: /Website down — HTTP 502 Bad Gateway/ }).click();
  const detail = page.getByRole("article");
  await expect(detail.getByText("INC-0412 · Downtime")).toBeVisible();
  await expect(detail.getByText(/0 of 2 recovery checks passed\. Next check/)).toBeVisible();
  await expect(detail.getByText("3 failed")).toBeVisible();
  await expect(detail.getByText("1 inconclusive (not counted)")).toBeVisible();

  await detail.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("INC-0412 acknowledged")).toBeVisible();
  await expect(detail.getByText(/^Acknowledged · Priya Raman/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(detail.getByRole("button", { name: "Acknowledge" })).toBeVisible();
  await detail.getByRole("button", { name: "Acknowledge" }).click();
  await expect(detail.getByText(/^Acknowledged · Priya Raman/)).toBeVisible();

  await detail.getByRole("button", { name: "Mute alerts…" }).click();
  const confirm = page.getByRole("region", { name: "Confirm mute" });
  await expect(confirm.getByText("No alert emails are sent for this incident while it’s muted.")).toBeVisible();
  await confirm.getByRole("button", { name: "Mute alerts" }).click();
  await expect(detail.getByText(/^Muted · Priya Raman/)).toBeVisible();
  await detail.getByRole("button", { name: "Unmute" }).click();
  await expect(detail.getByText(/^Acknowledged · Priya Raman/)).toBeVisible();

  await detail.getByRole("textbox", { name: "Internal note" }).fill("Host says nginx is restarting.");
  await detail.getByRole("button", { name: "Add note" }).click();
  await expect(detail.getByText("Host says nginx is restarting. — Priya Raman")).toBeVisible();
  await detail.getByRole("link", { name: "Checks" }).click();
  await expect(detail.getByText("Timed out after 10 s — excluded from failure count")).toBeVisible();
  await expect(detail.getByText("Host says nginx is restarting.")).toBeHidden();
  await expect(sidebar.getByRole("link", { name: /Incidents\s*1 not acknowledged/ })).toBeHidden();

  // Website detail.
  await detail.getByRole("link", { name: "Open website" }).click();
  await expect(page.getByRole("status").filter({ hasText: "HTTP 502 Bad Gateway" })).toBeVisible();
  await expect(page.getByText(/4 conclusive of 5 completed checks/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Latest checks" }).getByText("HTTP 200 OK · 262 ms")).toBeVisible();
  await expect(page.getByRole("link", { name: "Website down — HTTP 502 Bad Gateway" })).toBeVisible();
  await page.getByRole("button", { name: "Run check now" }).click();
  await expect(page.getByText("Check queued — the result appears in a few seconds")).toBeVisible();
});
