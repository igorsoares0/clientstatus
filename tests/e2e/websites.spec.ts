import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { onboard, visible } from "./helpers";

async function addWebsite(page: Page, url: string, opts: { name?: string; client?: string } = {}) {
  await page.getByRole("button", { name: "Add website" }).filter(visible).click();
  const dialog = page.getByRole("dialog", { name: "Add website" });
  await dialog.getByLabel("Website address").fill(url);
  if (opts.name) await dialog.getByLabel(/^Display name/).fill(opts.name);
  if (opts.client) await dialog.getByLabel("Client").selectOption({ label: opts.client });
  await dialog.getByRole("button", { name: "Add website" }).click();
  return dialog;
}

test("add, find, edit, pause, archive and restore websites", async ({ page }) => {
  await onboard(page);
  await page.goto("/websites");
  await expect(page.getByRole("heading", { name: "No websites yet" })).toBeVisible();

  // Validation in the dialog.
  const dialog = await addWebsite(page, "ftp://files.example.com");
  await expect(dialog.getByText("ftp:// isn’t supported — http or https only.")).toBeVisible();
  await dialog.getByLabel("Website address").fill("kiln-coffee.com");
  await expect(dialog.getByText("Will monitor https://kiln-coffee.com")).toBeVisible();
  await dialog.getByLabel(/^Display name/).fill("Kiln Coffee");
  await dialog.getByRole("button", { name: "Add website" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("kiln-coffee.com added · awaiting first check")).toBeVisible();

  // Duplicates are caught, with or without www.
  const dup = await addWebsite(page, "https://www.kiln-coffee.com/shop");
  await expect(dup.getByText("kiln-coffee.com is already monitored.")).toBeVisible();
  await dup.getByRole("button", { name: "Cancel" }).click();

  await addWebsite(page, "http://plain-shop.co.uk");
  await expect(page.getByText("1 monitored", { exact: false })).toBeHidden();
  await expect(page.getByText(/2 monitored · 0 paused · 98 of 100 plan slots free/)).toBeVisible();

  const table = page.locator("table").filter(visible);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row", { name: /Kiln Coffee/ }).getByText("Unknown")).toBeVisible();
  await expect(table.getByRole("row", { name: /plain-shop/ }).getByText("http only")).toBeVisible();

  // Search filters through the URL.
  await page.getByPlaceholder("Search name, hostname or client").fill("kiln");
  await expect(page).toHaveURL(/q=kiln/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(table.getByRole("row")).toHaveCount(3);

  // Detail page: settings save.
  await table.getByRole("link", { name: "Kiln Coffee" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kiln Coffee" })).toBeVisible();
  await expect(page.getByText("No check results yet.")).toBeVisible();
  const settings = page.locator("form").filter({ hasText: "What counts as down" });
  await settings.getByLabel("Display name").fill("Kiln Coffee Roasters");
  await settings.getByLabel("Request timeout").selectOption("15000");
  await settings.getByLabel(/Any response other than 2xx/).check();
  await expect(settings.getByText("Unsaved changes")).toBeVisible();
  await settings.getByRole("button", { name: "Save changes" }).click();
  await expect(settings.getByText("Saved")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Kiln Coffee Roasters" })).toBeVisible();

  // Pause with confirmation, undo from the toast, then pause for real.
  await page.getByRole("button", { name: "Pause monitoring…" }).click();
  const confirm = page.getByRole("region", { name: "Confirm pause" });
  await expect(confirm.getByText("Frees 1 of your 100 plan slots.")).toBeVisible();
  await confirm.getByRole("button", { name: "Pause monitoring" }).click();
  await expect(page.getByText("kiln-coffee.com paused · history kept")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause monitoring…" })).toBeVisible();

  // Archive and restore.
  await page.getByRole("button", { name: "Archive…" }).click();
  await page.getByRole("region", { name: "Confirm archive" }).getByRole("button", { name: "Archive website" }).click();
  await expect(page.getByText(/Archived on .* · history kept/)).toBeVisible();
  await page.goto("/websites");
  await expect(page.locator("table").filter(visible).getByRole("row")).toHaveCount(2);
  await page.goto("/websites?status=archived");
  await page.locator("table").filter(visible).getByRole("link", { name: "Kiln Coffee Roasters" }).click();
  await page.getByRole("button", { name: "Restore website" }).click();
  await expect(page.getByText("kiln-coffee.com restored · awaiting first check")).toBeVisible();
});

test("bulk pause and resume with consequences and undo", async ({ page }) => {
  await onboard(page);
  await page.goto("/websites");
  for (const host of ["alpha.example.com", "bravo.example.com", "charlie.example.com"]) {
    await addWebsite(page, host);
    await expect(page.getByText(`${host} added · awaiting first check`)).toBeVisible();
  }
  const table = page.locator("table").filter(visible);
  await table.getByRole("checkbox", { name: "Select alpha.example.com" }).check();
  await table.getByRole("checkbox", { name: "Select bravo.example.com" }).check();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.getByRole("button", { name: "Pause monitoring…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Pause monitoring for 2 websites?" });
  await expect(confirm.getByText("AFFECTED WEBSITES · 2")).toBeVisible();
  await confirm.getByRole("button", { name: "Pause 2 websites" }).click();
  await expect(page.getByText("Paused 2 websites · history kept")).toBeVisible();
  await expect(table.getByText("Paused")).toHaveCount(2);
  await expect(page.getByText(/1 monitored · 2 paused/)).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/3 monitored · 0 paused/)).toBeVisible();

  // Selecting only active sites and asking to resume explains instead of doing nothing.
  await table.getByRole("checkbox", { name: "Select charlie.example.com" }).check();
  await page.getByRole("button", { name: "Resume monitoring…" }).click();
  await expect(page.getByText("None of the selected websites are paused.")).toBeVisible();
});

test("CSV import previews every row and imports only valid ones", async ({ page }, testInfo) => {
  await onboard(page);
  const dir = testInfo.outputPath("csv");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "clients.csv");
  await writeFile(
    file,
    [
      "url,name,client",
      "harbourdental.co.uk,Harbour Dental Group,Harbour Dental Group",
      "https://shop.kiln-coffee.com,Kiln Coffee Shop,",
      "ftp://files.millerandkoch.com,M&K file server,",
      "192.168.1.20,Harbour staging,",
      "https://www.harbourdental.co.uk/book,Harbour booking,",
      ",Wren Hearing blog,",
    ].join("\n"),
  );

  await page.goto("/websites");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Import websites from CSV" });
  await dialog.locator('input[type="file"]').setInputFiles(file);

  await expect(dialog.getByText("● 2 ready")).toBeVisible();
  await expect(dialog.getByText("▲ 1 with warnings")).toBeVisible();
  await expect(dialog.getByText("◆ 4 won’t be imported")).toBeVisible();
  await expect(dialog.getByText("Ready · client “Harbour Dental Group” not found → Unassigned")).toBeVisible();
  await expect(dialog.getByText("Duplicate of row 2")).toBeVisible();
  await expect(dialog.getByText("Private or local address — blocked for safety")).toBeVisible();

  await dialog.getByRole("button", { name: "Import 2 websites" }).click();
  await expect(dialog.getByText("2 websites added")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Download skipped rows" })).toBeVisible();
  await dialog.getByRole("button", { name: "Show websites" }).click();
  await expect(page.locator("table").filter(visible).getByRole("row")).toHaveCount(3);
  await expect(page.getByText(/2 monitored · 0 paused · 98 of 100 plan slots free/)).toBeVisible();
});

test("clients: add, assign a website, edit notes, archive with paused sites, restore", async ({ page }) => {
  await onboard(page);
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible();

  await page.getByRole("button", { name: "Add client" }).click();
  const add = page.getByRole("dialog", { name: "Add client" });
  await add.getByLabel("Client name").fill("Harbour Dental Group");
  await add.getByLabel(/^Contact email/).fill("not-an-email");
  await add.getByRole("button", { name: "Add client" }).click();
  await expect(add.getByText("Contact email isn’t valid.")).toBeVisible();
  await add.getByLabel(/^Contact email/).fill("jane@harbourdental.example");
  await add.getByLabel(/^Contact name/).fill("Dr Jane Lee");
  await add.getByRole("button", { name: "Add client" }).click();

  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Harbour Dental Group" })).toBeVisible();
  await expect(page.getByText("jane@harbourdental.example")).toBeVisible();

  // Add a website preselected for this client.
  await page.getByRole("link", { name: "Add a website for this client" }).click();
  const dialog = page.getByRole("dialog", { name: "Add website" });
  await expect(dialog.getByLabel("Client")).toHaveValue(/[0-9a-f-]{36}/);
  await dialog.getByLabel("Website address").fill("harbourdental.co.uk");
  await dialog.getByRole("button", { name: "Add website" }).click();
  await expect(page.getByText("harbourdental.co.uk added · awaiting first check")).toBeVisible();
  await page.locator("table").filter(visible).getByRole("link", { name: "Harbour Dental Group" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbour Dental Group" })).toBeVisible();
  await expect(page.getByRole("link", { name: "harbourdental.co.uk" })).toBeVisible();

  // Internal notes.
  await page.getByRole("textbox", { name: "Internal notes" }).fill("Prefers Monday reports.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Archive, pausing its websites.
  await page.getByRole("button", { name: "Archive…" }).click();
  const confirm = page.getByRole("region", { name: "Confirm archive" });
  await confirm.getByLabel(/Pause them too/).check();
  await confirm.getByRole("button", { name: "Archive client" }).click();
  await expect(page.getByText("Harbour Dental Group archived · websites paused, history kept")).toBeVisible();
  await expect(page.getByText(/^Archived .* No new reports are generated\.$/)).toBeVisible();
  await expect(page.locator("table").filter(visible).getByText("Paused")).toBeVisible();

  await page.goto("/clients?tab=archived");
  await expect(page.getByRole("link", { name: "Harbour Dental Group" }).filter(visible)).toBeVisible();
  await page.getByRole("link", { name: "Harbour Dental Group" }).filter(visible).click();
  await page.getByRole("button", { name: "Restore client" }).click();
  await expect(page.getByText("Harbour Dental Group restored")).toBeVisible();
});
