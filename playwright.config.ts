import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { E2E_OPS_EMAIL, E2E_PADDLE_WEBHOOK_SECRET } from "./tests/e2e/constants";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// E2E runs a production build against the test database, with emails written
// to .dev-mailbox/ so tests can follow verification links.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BETTER_AUTH_URL: baseURL,
      EMAIL_DELIVERY: "mailbox",
      // Billing on, with test-only values: webhooks are signed by the tests, nothing calls Paddle.
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_API_KEY: "e2e-not-a-real-key",
      PADDLE_WEBHOOK_SECRET: E2E_PADDLE_WEBHOOK_SECRET,
      PADDLE_CLIENT_TOKEN: "test_e2e_client_token",
      PADDLE_PRICE_STARTER: "pri_e2e_starter",
      PADDLE_PRICE_GROWTH: "pri_e2e_growth",
      PADDLE_PRICE_PRO: "pri_e2e_pro",
      PADDLE_PRICE_STARTER_YEARLY: "pri_e2e_starter_yearly",
      PADDLE_PRICE_GROWTH_YEARLY: "pri_e2e_growth_yearly",
      PADDLE_PRICE_PRO_YEARLY: "pri_e2e_pro_yearly",
      OPS_ADMIN_EMAILS: E2E_OPS_EMAIL,
    },
  },
});
