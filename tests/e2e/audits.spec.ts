import { expect, test } from "@playwright/test";
import { Client } from "pg";
import "dotenv/config";
import { onboard, visible } from "./helpers";

/** What a finished partial audit leaves behind (the crawler itself is covered by integration tests). */
async function seedAudit(email: string, hostname: string) {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT s.id AS "siteId", s."workspaceId" FROM site s
       JOIN workspace_member m ON m."workspaceId" = s."workspaceId" JOIN "user" u ON u.id = m."userId"
       WHERE u.email = $1 AND s."normalizedHostname" = $2`,
      [email, hostname],
    );
    const { siteId, workspaceId } = rows[0];
    const run = await db.query(
      `INSERT INTO audit_run (id, "workspaceId", "siteId", status, trigger, "startedAt", "completedAt", "pagesVisited", "pagesBudget",
         "linksChecked", "inconclusiveLinks", "skippedByRobots", requests, "findingsCount", robots, "partialReasons", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'partial', 'scheduled', now() - interval '1 hour', now() - interval '50 minutes', 412, 1500,
         2960, 3, 2, 3400, 3, 'ok', ARRAY['JavaScript-rendered pages — coverage incomplete'], now() - interval '1 hour') RETURNING id`,
      [workspaceId, siteId],
    );
    const runId = run.rows[0].id;
    const findings: [string, string, string, string | null, string][] = [
      [
        "broken_link",
        "high",
        `https://${hostname}/services`,
        `https://${hostname}/old-prices`,
        "Broken internal link — HTTP 404 Not Found",
      ],
      ["missing_title", "medium", `https://${hostname}/contact`, null, "Missing <title> tag"],
      ["multiple_h1", "info", `https://${hostname}/`, null, "2 <h1> headings — usually one is clearer (advisory)"],
    ];
    for (const [i, [type, severity, source, target, summary]] of findings.entries()) {
      await db.query(
        `INSERT INTO audit_finding (id, "workspaceId", "siteId", "auditRunId", key, type, severity, "sourceUrl", "targetUrl", summary,
           "firstSeenAt", "lastSeenAt", "openKey", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::"FindingSeverity", $7, $8, $9, now() - interval '8 days', now() - interval '50 minutes', $2 || ':' || $4, now(), now())`,
        [workspaceId, siteId, runId, `k${i}`, type, severity, source, target, summary],
      );
    }
    await db.query(
      `UPDATE site_state SET "lastAuditAt" = now() - interval '50 minutes', "lastAuditStatus" = 'partial', "lastAuditRunId" = $2,
         "openFindings" = 3, "nextAuditAt" = now() + interval '3 days' WHERE "siteId" = $1`,
      [siteId, runId],
    );
  } finally {
    await db.end();
  }
}

test("audit findings show coverage limits, first-found dates and a manual rerun within the weekly allowance", async ({
  page,
}) => {
  const email = await onboard(page);
  await page.getByLabel("Website address").filter(visible).fill("harbourdental.co.uk");
  await page.getByRole("button", { name: "Start monitoring" }).filter(visible).click();
  await expect(page.getByText("awaiting first check").first()).toBeVisible();
  await seedAudit(email, "harbourdental.co.uk");

  await page.goto("/websites");
  const row = page
    .locator("table")
    .filter(visible)
    .getByRole("row", { name: /harbourdental/ });
  await expect(row.getByText("Partial")).toBeVisible();
  await row.getByRole("link", { name: "harbourdental.co.uk" }).first().click();

  const audit = page.locator("section#audit");
  await expect(audit.getByText("Partial", { exact: true })).toBeVisible();
  await expect(audit.getByText(/412 of 1,500-page budget · 2,960 links checked/)).toBeVisible();
  await expect(audit.getByText(/robots\.txt respected · 2 pages skipped/)).toBeVisible();
  await expect(audit.getByText(/Coverage incomplete\./)).toBeVisible();
  await expect(audit.getByText("JavaScript-rendered pages — coverage incomplete", { exact: false })).toBeVisible();

  const rows = audit.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Broken internal link — HTTP 404 Not Found");
  await expect(rows.first()).toContainText("/services → /old-prices");
  await expect(rows.last()).toContainText("advisory");
  await expect(audit.getByText(/Not a complete SEO audit, and no ranking promises/)).toBeVisible();

  // Growth allows 3 manual audits a week.
  await expect(audit.getByText("3 of 3 manual audits left this week")).toBeVisible();
  await audit.getByRole("button", { name: "Rerun audit" }).click();
  await expect(page.getByText("Audit queued — results appear here when it finishes")).toBeVisible();
  await expect(audit.getByText("Queued", { exact: true })).toBeVisible();
  await expect(audit.getByText("2 of 3 manual audits left this week")).toBeVisible();
  await expect(audit.getByRole("button", { name: "Audit in progress" })).toBeDisabled();
});
