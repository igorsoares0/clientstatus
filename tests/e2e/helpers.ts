import { expect, type Page } from "@playwright/test";
import { linkFromLatestEmail } from "./mailbox";

// Next keeps up to 3 previous routes mounted but hidden (<Activity>), so scope
// interactions to what is actually visible.
export const visible = { visible: true } as const;

export const PASSWORD = "correct horse battery";

/** New verified account with a workspace, skipping the first-website step. Ends on /overview. */
export async function onboard(
  page: Page,
  agency = "Northfold Studio",
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
): Promise<string> {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Priya Raman");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.goto(await linkFromLatestEmail(email, /Confirm your email/));
  await expect(page).toHaveURL(/\/onboarding\/workspace$/);
  await page.getByLabel("Agency name").fill(agency);
  await page.getByLabel("Timezone for reports and timestamps").selectOption("Europe/London");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/website$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  return email;
}
