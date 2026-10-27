import { expect, test, type Page } from "@playwright/test";
import { linkFromLatestEmail } from "./mailbox";

const PASSWORD = "correct horse battery";

// Next keeps up to 3 previous routes mounted but hidden (<Activity>), so scope
// interactions to what is actually visible.
const visible = { visible: true } as const;

async function signIn(page: Page, email: string, password: string, from = "/sign-in") {
  await page.goto(from);
  await page.getByLabel("Email").filter(visible).fill(email);
  await page.getByLabel("Password").filter(visible).fill(password);
  await page.getByRole("button", { name: "Sign in" }).filter(visible).click();
}

test("protected pages redirect to sign-in without a session", async ({ page }) => {
  await page.goto("/websites");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fwebsites$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign up → verify email → create workspace → use the shell → sign out → sign in", async ({ page }) => {
  const email = `priya-${Date.now()}@example.com`;

  // 1. Account, with the live password hint from the design.
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Your name").fill("Priya Raman");
  await page.getByLabel("Work email").fill(email);
  const password = page.getByLabel("Password");
  await password.fill("short");
  await expect(page.getByText("7 more characters needed.")).toBeVisible();
  await password.fill(PASSWORD);
  await expect(page.getByText("✓ Long enough")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();

  // 2. Verification: unverified users can't sign in yet.
  await expect(page).toHaveURL(/\/verify\?email=/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  const verifyUrl = await linkFromLatestEmail(email, /Confirm your email/);
  await page.goto(verifyUrl);

  // 3. Workspace.
  await expect(page).toHaveURL(/\/onboarding\/workspace$/);
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your agency’s name.")).toBeVisible();
  await page.getByLabel("Agency name").fill("Northfold Studio");
  await page.getByLabel("Timezone for reports and timestamps").selectOption("Europe/London");
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. First website: blocked addresses are refused, then a real one is added with a new client.
  await expect(page).toHaveURL(/\/onboarding\/website$/);
  await expect(page.getByRole("heading", { name: "Add your first client website" })).toBeVisible();
  await page.getByLabel("Website address").fill("http://localhost:3000");
  await page.getByRole("button", { name: "Start monitoring" }).click();
  await expect(page.getByText("Private or local address — blocked for safety.")).toBeVisible();
  await page.getByLabel("Website address").fill("harbourdental.co.uk");
  await expect(page.getByText("We’ll check https://harbourdental.co.uk")).toBeVisible();
  await page.getByLabel(/^Client/).fill("Harbour Dental Group");
  await page.getByRole("button", { name: "Start monitoring" }).click();

  // 5. Shell.
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Primary" }).filter(visible);
  await expect(sidebar.getByText("Northfold Studio")).toBeVisible();
  await expect(sidebar.getByText("Growth trial · 1 of 100 sites")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: /1 website awaiting first check/ })).toBeVisible();
  await expect(page.getByText("Website added")).toBeVisible();
  // No worker runs during e2e, so the status bar must not claim monitoring is current.
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText("Monitoring not started")).toBeVisible();
  await expect(footer.getByText(/Times in Europe\/London \((GMT|BST)\)/)).toBeVisible();

  // Keyboard navigation: G then W.
  await page.locator("body").click();
  await page.keyboard.press("g");
  await page.keyboard.press("w");
  await expect(page).toHaveURL(/\/websites$/);
  await expect(page.getByRole("heading", { level: 1, name: "Websites" })).toBeVisible();

  await sidebar.getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("cell", { name: "Priya Raman (you)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Owner" })).toBeVisible();

  await sidebar.getByRole("link", { name: "Billing" }).click();
  await expect(page.getByText("$99")).toBeVisible();

  // 6. Sign out, then back in.
  await sidebar.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, email, "wrong password!!");
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  // Signing in from a redirect returns to the page that was asked for.
  await signIn(page, email, PASSWORD, "/websites");
  await expect(page).toHaveURL(/\/websites$/);
  await expect(page.getByRole("heading", { level: 1, name: "Websites" })).toBeVisible();
  await page.goto("/overview");

  // 7. Below 980px the sidebar becomes a horizontal top bar.
  await expect(page.getByText("Growth trial · 1 of 100 sites")).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByText("Growth trial · 1 of 100 sites")).toBeHidden();
  const topBar = page.getByRole("navigation", { name: "Primary" }).filter(visible);
  await expect(topBar).toHaveCount(1);
  await topBar.getByRole("link", { name: "Clients" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  await expect(topBar.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "page");
});

test("password reset: request link → choose new password → sign in with it", async ({ page }) => {
  const email = `reset-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Sam Reset");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.goto(await linkFromLatestEmail(email, /Confirm your email/));
  await expect(page).toHaveURL(/\/onboarding\/workspace$/);
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").filter(visible).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

  const resetLink = await linkFromLatestEmail(email, /Reset your Client Status password/);
  await page.goto(resetLink);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = "a brand new passphrase";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(page).toHaveURL(/\/sign-in\?reset=1$/);
  await expect(page.getByText("Password changed. Sign in with your new password.")).toBeVisible();

  await signIn(page, email, PASSWORD);
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await signIn(page, email, newPassword);
  // No workspace yet, so onboarding continues where it left off.
  await expect(page).toHaveURL(/\/onboarding\/workspace$/);

  // The link is single-use.
  await page.context().clearCookies();
  await page.goto(resetLink);
  await expect(page.getByRole("heading", { name: "This link doesn’t work any more" })).toBeVisible();
});
