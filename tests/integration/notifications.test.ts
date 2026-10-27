import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSite } from "@/lib/data/sites";
import { acknowledgeIncident, muteIncident } from "@/lib/data/incidents";
import { createRunner } from "@/lib/jobs/runner";
import { recordSsl, recordUptime } from "@/lib/monitoring/apply";
import type { UptimeResult } from "@/lib/monitoring/classify";
import { queueReminders } from "@/lib/notify/reminders";
import { normalizeSiteUrl } from "@/lib/url";
import type { TenantContext } from "@/lib/data/tenant";
import { addMember, db, resetDb, workspaceWithOwner } from "./helpers";

const fail: UptimeResult = {
  status: "failure",
  category: "http_5xx",
  summary: "HTTP 502 Bad Gateway · 90 ms",
  httpStatus: 502,
  durationMs: 90,
  slow: false,
};
const ok: UptimeResult = {
  status: "success",
  category: null,
  summary: "HTTP 200 OK · 200 ms",
  httpStatus: 200,
  durationMs: 200,
  slow: false,
};

async function site(ctx: TenantContext, host = "harbourdental.co.uk") {
  const u = normalizeSiteUrl(host);
  if (!u.ok) throw new Error(u.error);
  const s = await createSite(db, ctx, { url: u.value });
  return { id: s.id, workspaceId: ctx.workspaceId, intervalMs: 120_000 };
}

async function goDown(
  ref: { id: string; workspaceId: string; intervalMs: number },
  t = new Date("2026-10-25T09:41:00Z"),
) {
  await recordUptime(db, ref, fail, t);
  await recordUptime(db, ref, fail, new Date(t.getTime() + 30_000));
  return db.incident.findFirstOrThrow({ where: { siteId: ref.id } });
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("incident alerts", () => {
  it("emails selected, verified team members once when an incident opens and once when it resolves", async () => {
    const owner = await workspaceWithOwner();
    const admin = await addMember(owner, "admin", "Tom Ellis");
    const ref = await site(owner);
    await db.notificationSettings.create({
      data: {
        workspaceId: owner.workspaceId,
        recipientUserIds: [owner.userId, admin.userId],
        events: {
          downtime: { opened: true, resolved: true },
          ssl_invalid: { opened: true, resolved: true },
          ssl_expiry: { opened: true },
          domain_expiry: { opened: true },
        },
      },
    });
    const incident = await goDown(ref);
    await recordUptime(db, ref, fail, new Date("2026-10-25T09:43:00Z")); // still down: no new email

    let mails = await db.emailDelivery.findMany({ orderBy: { createdAt: "asc" } });
    expect(mails.map((m) => m.templateType)).toEqual(["incident_opened", "incident_opened"]);
    expect(mails[0].subject).toBe("Website down — HTTP 502 Bad Gateway — harbourdental.co.uk");
    expect(mails[0].textBody).toContain(`/incidents?i=${incident.id}`);
    expect(await db.job.count({ where: { jobType: "email_send" } })).toBe(2);

    await recordUptime(db, ref, ok, new Date("2026-10-25T09:45:00Z"));
    await recordUptime(db, ref, ok, new Date("2026-10-25T09:45:30Z"));
    mails = await db.emailDelivery.findMany({ where: { templateType: "incident_resolved" } });
    expect(mails).toHaveLength(2);
    expect(mails[0].textBody).toMatch(/Resolved .* after 4 min/);
  });

  it("sends the queued emails through the worker", async () => {
    const owner = await workspaceWithOwner();
    const ref = await site(owner);
    await goDown(ref);
    const runner = createRunner(db, { workerId: "mail-test", concurrency: 4, deps: { now: () => new Date() } });
    await runner.claim();
    await runner.drain();
    const mail = await db.emailDelivery.findFirstOrThrow();
    expect(mail).toMatchObject({ status: "sent", attempts: 1, recipient: expect.stringContaining("owner-") });
  });

  it("respects per-event settings, site overrides, muting and unverified addresses", async () => {
    const owner = await workspaceWithOwner();
    const ref = await site(owner, "a.example.com");
    await db.notificationSettings.create({
      data: {
        workspaceId: owner.workspaceId,
        recipientUserIds: [owner.userId],
        events: {
          downtime: { opened: false, resolved: true },
          ssl_invalid: { opened: true, resolved: true },
          ssl_expiry: { opened: true },
          domain_expiry: { opened: true },
        },
      },
    });
    await goDown(ref);
    expect(await db.emailDelivery.count()).toBe(0);

    const ref2 = await site(owner, "b.example.com");
    await db.site.update({ where: { id: ref2.id }, data: { alertsEnabled: false } });
    await recordSsl(
      db,
      ref2,
      {
        status: "failure",
        state: "invalid",
        expiresAt: null,
        issuer: null,
        daysLeft: null,
        category: "untrusted",
        summary: "Certificate isn’t trusted (self-signed)",
      },
      new Date(),
    );
    expect(await db.emailDelivery.count()).toBe(0);

    await db.user.update({ where: { id: owner.userId }, data: { emailVerified: false } });
    const ref3 = await site(owner, "c.example.com");
    await recordSsl(
      db,
      ref3,
      {
        status: "failure",
        state: "invalid",
        expiresAt: null,
        issuer: null,
        daysLeft: null,
        category: "untrusted",
        summary: "Certificate isn’t trusted (self-signed)",
      },
      new Date(),
    );
    expect(await db.emailDelivery.count()).toBe(0);
  });

  it("emails once per expiry threshold, not on every check", async () => {
    const owner = await workspaceWithOwner();
    const ref = await site(owner);
    const exp = new Date("2026-11-20T00:00:00Z");
    const ssl = (days: number, at: string) =>
      recordSsl(
        db,
        ref,
        {
          status: "success",
          state: "expiring",
          expiresAt: exp,
          issuer: "LE",
          daysLeft: days,
          category: "expiring",
          summary: `Valid · expires in ${days} days`,
        },
        new Date(at),
      );
    await ssl(26, "2026-10-25T06:00:00Z");
    await ssl(25, "2026-10-26T06:00:00Z");
    await ssl(13, "2026-11-07T06:00:00Z");
    await ssl(12, "2026-11-08T06:00:00Z");
    await ssl(6, "2026-11-14T06:00:00Z");
    const types = (await db.emailDelivery.findMany({ orderBy: { createdAt: "asc" } })).map((m) => m.templateType);
    expect(types).toEqual(["incident_opened", "incident_threshold", "incident_threshold"]);
  });

  it("repeats alerts for open, unacknowledged incidents after the cooldown only", async () => {
    const owner = await workspaceWithOwner();
    const ref = await site(owner);
    const incident = await goDown(ref, new Date("2026-10-25T09:00:00Z"));
    expect(await queueReminders(db, new Date("2026-10-25T09:30:00Z"))).toBe(0); // default 60 min
    expect(await queueReminders(db, new Date("2026-10-25T10:01:00Z"))).toBe(1);
    expect(await queueReminders(db, new Date("2026-10-25T10:20:00Z"))).toBe(0);
    await acknowledgeIncident(db, owner, incident.id);
    expect(await queueReminders(db, new Date("2026-10-25T12:00:00Z"))).toBe(0);
    const reminder = await db.emailDelivery.findFirstOrThrow({ where: { templateType: "incident_reminder" } });
    expect(reminder.subject).toMatch(/^Still open:/);
  });

  it("doesn't send an alert that was muted before the worker got to it", async () => {
    const owner = await workspaceWithOwner();
    const ref = await site(owner);
    const incident = await goDown(ref);
    await muteIncident(db, owner, incident.id);
    const runner = createRunner(db, { workerId: "mail-test", concurrency: 4, deps: { now: () => new Date() } });
    await runner.claim();
    await runner.drain();
    expect(await db.emailDelivery.findFirstOrThrow()).toMatchObject({ status: "suppressed" });
  });
});

describe("notification settings", () => {
  it("creates defaults once even when read concurrently", async () => {
    const { getNotificationSettings } = await import("@/lib/notify/settings");
    const owner = await workspaceWithOwner();
    const results = await Promise.all(Array.from({ length: 5 }, () => getNotificationSettings(db, owner.workspaceId)));
    expect(results.every((r) => r.recipientUserIds[0] === owner.userId)).toBe(true);
    expect(await db.notificationSettings.count()).toBe(1);
  });
});
