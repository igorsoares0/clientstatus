import { execSync } from "node:child_process";
import "dotenv/config";
import { Client } from "pg";

// Plain `pg` here: Playwright loads TypeScript as CommonJS, and the generated
// Prisma client is ESM-only.

/** Fresh, migrated test database for every e2e run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL)
    throw new Error("TEST_DATABASE_URL must be set and differ from DATABASE_URL");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    'TRUNCATE "billing_event", "billing_transaction", "subscription", "report_delivery", "monthly_report", "client_recipient", "email_delivery", "notification_settings", "job", "audit_finding", "audit_run", "incident_event", "incident", "monitor_check", "site_state", "site", "client", "audit_log", "workspace_member", "workspace", "session", "account", "verification", "user", "worker_heartbeat" CASCADE',
  );
  await client.end();
}
