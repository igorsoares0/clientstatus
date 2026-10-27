import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimJobs, completeJob, enqueue, failJob, recoverExpiredLeases, LEASE_MS } from "@/lib/jobs/queue";
import { createRunner } from "@/lib/jobs/runner";
import { recordDomain, recordSsl, type SiteRef } from "@/lib/monitoring/apply";
import { BlockedAddressError, guardedLookup, safeFetch } from "@/lib/monitoring/safe-fetch";
import { scheduleDueWork } from "@/lib/monitoring/scheduler";
import { checkCertificate } from "@/lib/monitoring/tls-check";
import type { TenantContext } from "@/lib/data/tenant";
import { db, resetDb, workspaceWithOwner } from "./helpers";

// A local HTTP server whose behaviour each test scripts.
let server: Server;
let port = 0;
let respond: (path: string) => { status: number; delayMs?: number; location?: string } = () => ({ status: 200 });

beforeAll(async () => {
  server = createServer((req, res) => {
    const r = respond(req.url ?? "/");
    setTimeout(() => {
      if (r.location) res.setHeader("location", r.location);
      res.writeHead(r.status).end("ok");
    }, r.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "job", "worker_heartbeat" CASCADE');
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "job" CASCADE');
  respond = () => ({ status: 200 });
});

/** A site pointing at the local test server (bypasses input validation, which blocks localhost). */
async function localSite(ctx: TenantContext, path = "/", timeoutMs = 2000) {
  const site = await db.site.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: "Local",
      nameKey: "local",
      baseUrl: `http://127.0.0.1:${port}${path}`,
      normalizedHostname: `local-${Math.random()}.test`,
      liveHostKey: `local-${Math.random()}.test`,
      registrableDomain: "local.test",
      timeoutMs,
    },
  });
  await db.siteState.create({ data: { siteId: site.id, workspaceId: ctx.workspaceId } });
  return site;
}

function runnerAt(clock: { now: Date }) {
  return createRunner(db, {
    workerId: "test-worker",
    concurrency: 4,
    deps: { now: () => clock.now, fetch: { allowPrivate: true } },
  });
}

/** Makes the site's uptime check due, then schedules, claims and runs it. */
async function runUptimeCheck(clock: { now: Date }, siteId: string) {
  await db.siteState.update({
    where: { siteId },
    data: {
      nextCheckAt: clock.now,
      nextSslCheckAt: new Date(clock.now.getTime() + 3.6e6),
      nextDomainCheckAt: new Date(clock.now.getTime() + 3.6e6),
    },
  });
  const runner = runnerAt(clock);
  await runner.schedule();
  await runner.claim();
  await runner.drain();
}

describe("job queue", () => {
  it("dedupes active work by activeKey and lets it run again once done", async () => {
    expect(await enqueue(db, [{ jobType: "uptime_check", resourceType: "site", resourceId: "s1" }])).toBe(1);
    expect(await enqueue(db, [{ jobType: "uptime_check", resourceType: "site", resourceId: "s1" }])).toBe(0);
    const [job] = await claimJobs(db, "w1", 10);
    await completeJob(db, job.id, "w1");
    expect(await enqueue(db, [{ jobType: "uptime_check", resourceType: "site", resourceId: "s1" }])).toBe(1);
  });

  it("never hands the same job to two workers", async () => {
    await enqueue(
      db,
      Array.from({ length: 20 }, (_, i) => ({ jobType: "uptime_check", resourceType: "site", resourceId: `s${i}` })),
    );
    const [a, b, c] = await Promise.all([claimJobs(db, "w1", 10), claimJobs(db, "w2", 10), claimJobs(db, "w3", 10)]);
    const ids = [...a, ...b, ...c].map((j) => j.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("retries with backoff, then fails and frees the active key", async () => {
    const now = new Date("2026-10-25T09:00:00Z");
    await enqueue(db, [{ jobType: "x", resourceType: "site", resourceId: "s1", maxAttempts: 2, runAt: now }]);
    const [first] = await claimJobs(db, "w1", 1, now);
    expect(await failJob(db, first, "w1", new Error("boom https://example.com/?token=secret"), now)).toBe("retrying");
    const retried = await db.job.findUniqueOrThrow({ where: { id: first.id } });
    expect(retried).toMatchObject({ status: "pending", lastError: "Error: boom https://example.com/" });
    expect(retried.runAt.getTime()).toBe(now.getTime() + 30_000);

    expect(await claimJobs(db, "w1", 1, now)).toHaveLength(0); // not due yet
    const later = new Date(now.getTime() + 30_000);
    const [second] = await claimJobs(db, "w1", 1, later);
    expect(await failJob(db, second, "w1", new Error("boom"), later)).toBe("failed");
    expect(await db.job.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      status: "failed",
      activeKey: null,
    });
  });

  it("requeues jobs whose worker died", async () => {
    const now = new Date("2026-10-25T09:00:00Z");
    await enqueue(db, [{ jobType: "x", resourceType: "site", resourceId: "s1", runAt: now }]);
    await claimJobs(db, "dead-worker", 1, now);
    const later = new Date(now.getTime() + LEASE_MS + 1000);
    expect(await recoverExpiredLeases(db, later)).toEqual({ failed: 0, requeued: 1 });
    expect(await claimJobs(db, "w2", 1, later)).toHaveLength(1);
  });
});

describe("uptime monitoring and downtime incidents", () => {
  it("confirms downtime on the 2nd failure and resolves after 2 passes", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    const clock = { now: new Date("2026-10-25T09:39:05Z") };

    await runUptimeCheck(clock, site.id);
    expect(await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).toMatchObject({
      liveStatus: "up",
      lastHttpStatus: 200,
    });

    respond = () => ({ status: 502 });
    clock.now = new Date("2026-10-25T09:41:07Z");
    await runUptimeCheck(clock, site.id);
    const afterFirst = await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } });
    expect(afterFirst).toMatchObject({ liveStatus: "degraded", consecutiveFailures: 1 });
    expect(afterFirst.nextCheckAt.getTime()).toBe(clock.now.getTime() + 30_000); // confirmation check
    expect(await db.incident.count()).toBe(0);

    clock.now = new Date("2026-10-25T09:41:37Z");
    await runUptimeCheck(clock, site.id);
    const incident = await db.incident.findFirstOrThrow({ include: { events: true } });
    expect(incident).toMatchObject({
      number: 1,
      type: "downtime",
      severity: "critical",
      status: "open",
      title: "Website down — HTTP 502 Bad Gateway",
    });
    expect(incident.events.map((e) => e.eventType)).toEqual(["opened"]);
    expect((await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).liveStatus).toBe("down");

    // A third failure updates the same incident rather than opening another.
    clock.now = new Date("2026-10-25T09:43:37Z");
    await runUptimeCheck(clock, site.id);
    expect(await db.incident.count()).toBe(1);

    respond = () => ({ status: 200 });
    clock.now = new Date("2026-10-25T09:45:37Z");
    await runUptimeCheck(clock, site.id);
    expect(await db.incident.findFirstOrThrow()).toMatchObject({ status: "open" });
    clock.now = new Date("2026-10-25T09:46:07Z");
    await runUptimeCheck(clock, site.id);
    const resolved = await db.incident.findFirstOrThrow({ include: { events: { orderBy: { createdAt: "asc" } } } });
    expect(resolved).toMatchObject({ status: "resolved", openKey: null });
    expect(resolved.resolvedAt?.toISOString()).toBe("2026-10-25T09:46:07.000Z");
    expect(resolved.events.map((e) => e.eventType)).toEqual(["opened", "resolved"]);
    expect(await db.monitorCheck.count({ where: { siteId: site.id, checkType: "uptime" } })).toBe(6);
  });

  it("treats timeouts as inconclusive: recorded, but no incident", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx, "/", 300);
    respond = () => ({ status: 200, delayMs: 1500 });
    const clock = { now: new Date("2026-10-25T10:00:00Z") };
    await runUptimeCheck(clock, site.id);
    clock.now = new Date("2026-10-25T10:02:00Z");
    await runUptimeCheck(clock, site.id);
    const checks = await db.monitorCheck.findMany({ where: { siteId: site.id } });
    expect(checks.map((c) => c.status)).toEqual(["inconclusive", "inconclusive"]);
    expect(checks[0]).toMatchObject({
      failureCategory: "timeout",
      summary: "Timed out after 300 ms — excluded from failure count",
    });
    expect(await db.incident.count()).toBe(0);
    expect((await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).liveStatus).toBe("unknown");
  });

  it("skips sites paused after their job was queued", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    const clock = { now: new Date("2026-10-25T10:00:00Z") };
    const runner = runnerAt(clock);
    await runner.schedule();
    await db.site.update({ where: { id: site.id }, data: { status: "paused" } });
    await runner.claim();
    await runner.drain();
    expect(await db.monitorCheck.count()).toBe(0);
  });
});

describe("scheduler", () => {
  it("creates missing state, queues each check once and plans daily housekeeping", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    await db.siteState.delete({ where: { siteId: site.id } });
    const now = new Date("2026-10-25T10:00:00Z");

    const first = await scheduleDueWork(db, now);
    expect(first).toMatchObject({ uptime: 1, ssl: 1, domain: 1, audit: 1 });
    expect((await db.job.findMany({ select: { jobType: true } })).map((j) => j.jobType).sort()).toEqual([
      "domain_check",
      "prune",
      "site_audit",
      "ssl_check",
      "uptime_check",
    ]);
    const again = await scheduleDueWork(db, now);
    expect(again).toMatchObject({ uptime: 0, ssl: 0, domain: 0, audit: 0, queued: 0 });
    const state = await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } });
    expect(state.nextCheckAt.getTime()).toBe(now.getTime() + 120_000); // Growth: every 2 minutes
  });
});

describe("SSL and domain incidents", () => {
  async function ref(): Promise<SiteRef> {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    return { id: site.id, workspaceId: ctx.workspaceId, intervalMs: 120_000 };
  }
  const base = { issuer: "Let's Encrypt", category: null };

  it("opens an expiry incident at 30 days, escalates by threshold and resolves on renewal", async () => {
    const site = await ref();
    const day = (d: string) => new Date(`2026-10-${d}T06:00:00Z`);
    const expiresAt = new Date("2026-11-20T00:00:00Z");
    await recordSsl(
      db,
      site,
      { ...base, status: "success", state: "expiring", expiresAt, daysLeft: 26, summary: "Valid · expires in 26 days" },
      day("25"),
    );
    expect(await db.incident.findFirstOrThrow()).toMatchObject({
      type: "ssl_expiry",
      severity: "low",
      title: "SSL certificate expires in 26 days",
    });

    await recordSsl(
      db,
      site,
      { ...base, status: "success", state: "expiring", expiresAt, daysLeft: 6, summary: "Valid · expires in 6 days" },
      day("26"),
    );
    const incident = await db.incident.findFirstOrThrow({ include: { events: true } });
    expect(incident).toMatchObject({ severity: "high", title: "SSL certificate expires in 6 days" });
    expect(incident.events.map((e) => [e.eventType, e.detail])).toContainEqual([
      "severity_changed",
      "7-day threshold reached",
    ]);

    await recordSsl(
      db,
      site,
      {
        ...base,
        status: "success",
        state: "valid",
        expiresAt: new Date("2027-02-01T00:00:00Z"),
        daysLeft: 98,
        summary: "Valid · 98 days remaining",
      },
      day("27"),
    );
    expect(await db.incident.findFirstOrThrow()).toMatchObject({ status: "resolved" });
    expect(await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).toMatchObject({
      sslState: "valid",
      sslIssuer: "Let's Encrypt",
    });
  });

  it("opens ssl_invalid for a mismatched certificate and keeps state on inconclusive checks", async () => {
    const site = await ref();
    const now = new Date("2026-10-25T06:00:14Z");
    await recordSsl(
      db,
      site,
      {
        ...base,
        status: "failure",
        state: "invalid",
        expiresAt: null,
        daysLeft: null,
        summary: "Certificate doesn’t match the hostname",
      },
      now,
    );
    expect(await db.incident.findFirstOrThrow()).toMatchObject({
      type: "ssl_invalid",
      severity: "high",
      title: "Certificate doesn’t match the hostname",
    });

    await recordSsl(
      db,
      site,
      {
        status: "inconclusive",
        state: "unknown",
        expiresAt: null,
        issuer: null,
        daysLeft: null,
        category: "timeout",
        summary: "TLS timed out",
      },
      new Date(now.getTime() + 6 * 3.6e6),
    );
    expect(await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).toMatchObject({ sslState: "invalid" });
    expect(await db.incident.findFirstOrThrow()).toMatchObject({ status: "open" });
  });

  it("records domain expiry only when the registry publishes it", async () => {
    const site = await ref();
    const now = new Date("2026-10-25T02:00:09Z");
    await recordDomain(
      db,
      site,
      {
        status: "success",
        state: "unsupported",
        expiresAt: null,
        source: null,
        daysLeft: null,
        summary: "n/a — expiry not published by the registry",
      },
      now,
    );
    expect(await db.incident.count()).toBe(0);
    expect(await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).toMatchObject({
      domainState: "unsupported",
      domainExpiresAt: null,
    });

    await recordDomain(
      db,
      site,
      {
        status: "success",
        state: "expiring",
        expiresAt: new Date("2026-11-06T00:00:00Z"),
        source: "rdap.verisign.com RDAP",
        daysLeft: 11,
        summary: "Registration expires 6 Nov 2026 (11 days)",
      },
      now,
    );
    expect(await db.incident.findFirstOrThrow()).toMatchObject({
      type: "domain_expiry",
      severity: "medium",
      title: "Domain registration expires in 11 days",
    });
  });

  it("numbers incidents per workspace", async () => {
    const a = await ref();
    const b = await ref();
    const failure = {
      ...base,
      status: "failure" as const,
      state: "invalid" as const,
      expiresAt: null,
      daysLeft: null,
      summary: "Certificate isn’t trusted (self-signed)",
    };
    await recordSsl(db, a, failure, new Date());
    await recordSsl(db, b, failure, new Date());
    const numbers = (await db.incident.findMany({ select: { number: true } })).map((i) => i.number);
    expect(numbers).toEqual([1, 1]);
  });
});

describe("SSRF guard", () => {
  it("blocks loopback by name and by IP literal unless explicitly allowed (tests only)", async () => {
    await expect(safeFetch(`http://localhost:${port}/`, { timeoutMs: 2000 })).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    await expect(safeFetch(`http://127.0.0.1:${port}/`, { timeoutMs: 2000 })).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    await expect(
      safeFetch(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, allowPrivate: true }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("re-validates redirect targets", async () => {
    respond = (path) =>
      path === "/start" ? { status: 302, location: "http://169.254.169.254/latest/meta-data" } : { status: 200 };
    // allowPrivate lets the first hop reach the test server; the literal check still guards the metadata IP when disabled.
    const resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(
      safeFetch(`http://public.example:${port}/start`, { timeoutMs: 2000, resolver }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("blocks private IP literals in the TLS check too", async () => {
    await expect(checkCertificate("127.0.0.1", { port, timeoutMs: 2000 })).resolves.toMatchObject({
      status: "failure",
      category: "blocked",
    });
    await expect(checkCertificate("[::1]", { port, timeoutMs: 2000 })).resolves.toMatchObject({ category: "blocked" });
  });

  it("rejects DNS answers containing any private address", async () => {
    const lookup = guardedLookup(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    const err = await new Promise((resolve) => lookup("mixed.example", {}, (e) => resolve(e)));
    expect(err).toBeInstanceOf(BlockedAddressError);
  });

  it("follows redirects up to the limit and detects loops", async () => {
    respond = (path) =>
      path === "/a"
        ? { status: 301, location: "/b" }
        : path === "/b"
          ? { status: 301, location: "/a" }
          : { status: 200 };
    await expect(
      safeFetch(`http://127.0.0.1:${port}/a`, { timeoutMs: 2000, allowPrivate: true }),
    ).rejects.toMatchObject({ kind: "loop" });
  });
});
