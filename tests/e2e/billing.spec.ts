import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import "dotenv/config";
import { E2E_OPS_EMAIL, E2E_PADDLE_WEBHOOK_SECRET } from "./constants";
import { onboard, visible } from "./helpers";

// Phase 5: Paddle webhooks drive plan and access (signed here exactly as Paddle
// signs them), plan limits, cross-tenant denial and the internal ops page.

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query(query, params)).rows as T[];
  } finally {
    await db.end();
  }
}

async function workspaceIdFor(email: string): Promise<string> {
  const [row] = await sql<{ workspaceId: string }>(
    `SELECT m."workspaceId" FROM workspace_member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1`,
    [email],
  );
  return row!.workspaceId;
}

function customData(workspaceId: string) {
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`paddle-checkout:${workspaceId}`)
    .digest("base64url");
  return { workspace_id: workspaceId, workspace_sig: sig };
}

function signature(body: string, secret = E2E_PADDLE_WEBHOOK_SECRET) {
  const ts = Math.floor(Date.now() / 1000);
  return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
}

async function webhook(
  request: APIRequestContext,
  type: string,
  data: unknown,
  opts: { id?: string; secret?: string } = {},
) {
  const body = JSON.stringify({
    event_id: opts.id ?? `evt_${randomUUID().replaceAll("-", "")}`,
    event_type: type,
    occurred_at: new Date().toISOString(),
    data,
  });
  return request.post("/api/webhooks/paddle", {
    data: body,
    headers: { "content-type": "application/json", "paddle-signature": signature(body, opts.secret) },
  });
}

function subscription(workspaceId: string, o: Record<string, unknown> = {}) {
  return {
    id: "sub_e2e",
    status: "active",
    customer_id: "ctm_e2e",
    items: [{ price: { id: "pri_e2e_pro" } }],
    current_billing_period: { starts_at: "2026-10-14T00:00:00Z", ends_at: "2026-11-14T00:00:00Z" },
    scheduled_change: null,
    custom_data: customData(workspaceId),
    updated_at: new Date().toISOString(),
    ...o,
  };
}

test("Paddle webhooks drive the plan: subscribe, invoice, failed payment, cancellation", async ({ page, request }) => {
  const email = await onboard(page);
  const workspaceId = await workspaceIdFor(email);

  // Unsigned or wrongly signed requests are rejected.
  expect(
    (await webhook(request, "subscription.created", subscription(workspaceId), { secret: "wrong" })).status(),
  ).toBe(401);

  // Subscribe; the same event delivered twice is applied once.
  const first = await webhook(request, "subscription.created", subscription(workspaceId), { id: "evt_e2e_created" });
  expect(await first.text()).toBe("applied");
  expect(
    await (await webhook(request, "subscription.created", subscription(workspaceId), { id: "evt_e2e_created" })).text(),
  ).toBe("duplicate");
  await webhook(request, "transaction.completed", {
    id: "txn_e2e",
    status: "completed",
    customer_id: "ctm_e2e",
    subscription_id: "sub_e2e",
    invoice_number: "325-10012",
    custom_data: customData(workspaceId),
    currency_code: "USD",
    billed_at: "2026-10-14T00:00:00Z",
    created_at: "2026-10-14T00:00:00Z",
    updated_at: new Date().toISOString(),
    details: { totals: { grand_total: "14900" } },
    payments: [
      {
        status: "captured",
        method_details: { card: { type: "visa", last4: "4417", expiry_month: 3, expiry_year: 2028 } },
      },
    ],
  });

  await page.goto("/billing");
  await expect(page.getByRole("heading", { level: 2, name: "Pro plan" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText(/Renews 14 Nov 2026/)).toBeVisible();
  await expect(page.getByText("Visa ending 4417")).toBeVisible();
  await expect(page.getByText("325-10012")).toBeVisible();
  await expect(page.getByRole("meter", { name: "Plan usage" })).toHaveAttribute("aria-valuemax", "150");
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .filter(visible)
      .getByText(/Pro plan · 0 of 150 sites/),
  ).toBeVisible();
  await expect(page.getByText("/ month, billed monthly")).toBeVisible();

  // Switching to the yearly price (in the Paddle portal) shows up as yearly billing.
  await webhook(
    request,
    "subscription.updated",
    subscription(workspaceId, { items: [{ price: { id: "pri_e2e_pro_yearly" } }] }),
  );
  await page.reload();
  await expect(page.getByText("/ year, billed yearly")).toBeVisible();
  await expect(page.getByRole("region", { name: "Pro plan" }).getByText("$1,990")).toBeVisible();

  // A failed payment keeps everything running, with a banner on every page.
  await webhook(request, "subscription.past_due", subscription(workspaceId, { status: "past_due" }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Payment failed" })).toContainText(/continue as normal until/);
  await page.goto("/overview");
  await expect(page.getByRole("alert").filter({ hasText: "Payment failed" })).toContainText(
    "Monitoring continues until",
  );

  // Cancelled: monitoring stops, data stays, new websites are refused with the reason.
  const canceledAt = new Date(Date.now() - 60_000).toISOString();
  await webhook(
    request,
    "subscription.canceled",
    subscription(workspaceId, { status: "canceled", canceled_at: canceledAt }),
  );
  // The workspace was on a trial, whose unused days still count — end it so the cancellation bites.
  await sql(`UPDATE workspace SET "trialEndsAt" = now() - interval '1 day', "accessEndsAt" = $2 WHERE id = $1`, [
    workspaceId,
    canceledAt,
  ]);
  await page.goto("/overview");
  await expect(page.getByRole("alert").filter({ hasText: "No active plan" })).toBeVisible();
  await expect(page.getByText("Monitoring stopped — no active plan")).toBeVisible();
  await page.getByLabel("Website address").filter(visible).fill("harbourdental.co.uk");
  await page.getByRole("button", { name: "Start monitoring" }).filter(visible).click();
  await expect(page.getByText(/Monitoring is stopped because this workspace has no active plan/).first()).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByRole("alert").filter({ hasText: "Subscription ended" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Growth" })).toBeVisible();

  // Monthly by default; yearly shows ten months' price ("2 months free").
  const plans = page.locator("#plans");
  await expect(plans.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
  const card = (name: string) => plans.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
  await expect(card("Growth")).toContainText("$99 / month");
  await plans.getByRole("button", { name: /Yearly/ }).click();
  await expect(plans.getByRole("button", { name: /Yearly 2 months free/ })).toHaveAttribute("aria-pressed", "true");
  await expect(card("Growth")).toContainText("$990 / year");
  await expect(card("Pro")).toContainText("$1,990 / year");
  await expect(plans.getByText(/Billed yearly in USD/)).toBeVisible();
});

test("plan limits: a full Starter workspace can't add another website", async ({ page }) => {
  const email = await onboard(page);
  const workspaceId = await workspaceIdFor(email);
  await sql(`UPDATE workspace SET "planKey" = 'starter' WHERE id = $1`, [workspaceId]);
  await sql(
    `INSERT INTO site (id, "workspaceId", name, "nameKey", "baseUrl", "normalizedHostname", "liveHostKey", "updatedAt")
     SELECT gen_random_uuid()::text, $1, 'site-' || n || '.example.com', 'site-' || n || '.example.com',
            'https://site-' || n || '.example.com', 'site-' || n || '.example.com', 'site-' || n || '.example.com', now()
     FROM generate_series(1, 15) AS n`,
    [workspaceId],
  );
  await page.goto("/websites?add=1");
  const dialog = page.getByRole("dialog", { name: "Add website" });
  await expect(dialog.getByText("0 of 15 slots free")).toBeVisible();
  await dialog.getByLabel("Website address").fill("one-too-many.example.com");
  await dialog.getByRole("button", { name: "Add website" }).click();
  await expect(dialog.getByText(/Your plan is full \(15 sites on Starter\)/)).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByRole("alert").filter({ hasText: "Plan limit reached — 15 of 15 websites" })).toBeVisible();
});

test("another workspace's pages and files are not found", async ({ page, browser }) => {
  await onboard(page, "Alpha Agency");
  await page.getByLabel("Website address").filter(visible).fill("alpha-client.co.uk");
  await page
    .getByLabel(/^Client/)
    .filter(visible)
    .fill("Alpha Client");
  await page.getByRole("button", { name: "Start monitoring" }).filter(visible).click();
  await expect(page.getByText("awaiting first check").first()).toBeVisible();
  const [site] = await sql<{ id: string; clientId: string }>(
    `SELECT id, "clientId" FROM site WHERE "normalizedHostname" = 'alpha-client.co.uk' ORDER BY "createdAt" DESC LIMIT 1`,
  );

  const other = await browser.newContext();
  const intruder = await other.newPage();
  await onboard(intruder, "Bravo Agency");
  for (const path of [`/websites/${site!.id}`, `/clients/${site!.clientId}`]) {
    await intruder.goto(path);
    await expect(intruder.getByText(/could not be found|doesn’t exist/i).first(), path).toBeVisible();
    await expect(intruder.getByText("alpha-client.co.uk")).toHaveCount(0);
  }
  expect((await intruder.request.get(`/api/reports/${randomUUID()}/pdf`)).status()).toBe(404);
  await other.close();
});

test("ops dashboard is only for allowlisted staff", async ({ page, browser }) => {
  await onboard(page);
  await page.goto("/ops");
  await expect(page.getByText(/could not be found/i).first()).toBeVisible();

  const staff = await browser.newContext();
  const ops = await staff.newPage();
  await onboard(ops, "Ops Agency", E2E_OPS_EMAIL);
  await ops.goto("/ops");
  await expect(ops.getByRole("heading", { level: 1, name: "Operations" })).toBeVisible();
  await expect(ops.getByText("WORKERS ALIVE")).toBeVisible();
  await expect(ops.getByRole("heading", { name: "Queue by job type" })).toBeVisible();
  await staff.close();
});
