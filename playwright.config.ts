import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

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
    },
  },
});
