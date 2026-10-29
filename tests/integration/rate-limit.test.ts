import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prune } from "@/lib/monitoring/scheduler";
import { allow, postgresStore } from "@/lib/rate-limit";
import { db, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("shared rate limits", () => {
  it("hold under concurrency, as every web instance shares the counters", async () => {
    const store = postgresStore(db);
    const now = Date.parse("2026-10-28T12:00:00Z");
    const results = await Promise.all(
      Array.from({ length: 30 }, () => allow("signup:203.0.113.9", 10, 60_000, now, store)),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
    // A new window starts once the old one has passed.
    expect(await allow("signup:203.0.113.9", 10, 60_000, now + 60_001, store)).toBe(true);
  });

  it("stores keys hashed, never the email or address in them, and prunes expired windows", async () => {
    const store = postgresStore(db);
    await allow("signin-addr:victim@example.com", 5, 60_000, Date.parse("2026-10-28T12:00:00Z"), store);
    const [row] = await db.rateLimitBucket.findMany();
    expect(row!.key).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.key).not.toContain("victim");
    await prune(db, new Date("2026-10-28T12:02:00Z"));
    expect(await db.rateLimitBucket.count()).toBe(0);
  });
});
