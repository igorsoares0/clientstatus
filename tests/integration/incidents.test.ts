import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acknowledgeIncident,
  addIncidentNote,
  getIncident,
  incidentStateCounts,
  listIncidents,
  muteIncident,
  reopenAcknowledged,
  unacknowledgedCount,
  unmuteIncident,
} from "@/lib/data/incidents";
import { requestManualCheck } from "@/lib/data/monitoring";
import { portfolio } from "@/lib/data/overview";
import { createSite, pauseSites, resumeSites } from "@/lib/data/sites";
import { recordSsl, recordUptime } from "@/lib/monitoring/apply";
import type { UptimeResult } from "@/lib/monitoring/classify";
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

async function siteWithDowntime(ctx: TenantContext, host = "harbourdental.co.uk") {
  const u = normalizeSiteUrl(host);
  if (!u.ok) throw new Error(u.error);
  const site = await createSite(db, ctx, { url: u.value });
  const ref = { id: site.id, workspaceId: ctx.workspaceId, intervalMs: 120_000 };
  const t = new Date("2026-10-25T09:41:00Z");
  await recordUptime(db, ref, fail, t);
  await recordUptime(db, ref, fail, new Date(t.getTime() + 30_000));
  const incident = await db.incident.findFirstOrThrow({ where: { siteId: site.id } });
  return { site, ref, incident };
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "job" CASCADE');
  await db.$disconnect();
});

describe("incident actions", () => {
  it("acknowledge, undo, mute, unmute and notes all write events; members may act", async () => {
    const owner = await workspaceWithOwner();
    const member = await addMember(owner, "member", "Tom Ellis");
    const { incident } = await siteWithDowntime(owner);
    expect(await unacknowledgedCount(db, owner)).toBe(1);

    await acknowledgeIncident(db, member, incident.id);
    expect(await unacknowledgedCount(db, owner)).toBe(0);
    await reopenAcknowledged(db, member, incident.id); // toast "Undo"
    await acknowledgeIncident(db, owner, incident.id);
    await muteIncident(db, owner, incident.id);
    await unmuteIncident(db, owner, incident.id);
    expect((await db.incident.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("acknowledged");
    await addIncidentNote(db, member, incident.id, "  Asked the host to restart nginx.  ");

    const detail = await getIncident(db, owner, incident.id);
    expect(detail.events.map((e) => [e.eventType, e.actor?.name ?? null]).reverse()).toEqual([
      ["opened", null],
      ["acknowledged", "Tom Ellis"],
      ["unacknowledged", "Tom Ellis"],
      ["acknowledged", "Owner"],
      ["muted", "Owner"],
      ["unmuted", "Owner"],
      ["note", "Tom Ellis"],
    ]);
    expect(detail.events[0].note).toBe("Asked the host to restart nginx.");
  });

  it("rejects invalid transitions and other workspaces", async () => {
    const a = await workspaceWithOwner("A");
    const b = await workspaceWithOwner("B");
    const { incident } = await siteWithDowntime(a);
    await expect(unmuteIncident(db, a, incident.id)).rejects.toMatchObject({ code: "invalid" });
    await expect(acknowledgeIncident(db, b, incident.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(addIncidentNote(db, b, incident.id, "x")).rejects.toMatchObject({ code: "not_found" });
    await expect(getIncident(db, b, incident.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listIncidents(db, b, {})).toHaveLength(0);
  });

  it("keeps resolved incidents for 30 days in lists and filters by state, type and search", async () => {
    const ctx = await workspaceWithOwner();
    const { ref, incident } = await siteWithDowntime(ctx);
    await recordUptime(db, ref, ok, new Date("2026-10-25T09:45:00Z"));
    await recordUptime(db, ref, ok, new Date("2026-10-25T09:45:30Z"));
    await recordSsl(
      db,
      ref,
      {
        status: "failure",
        state: "invalid",
        expiresAt: null,
        issuer: null,
        daysLeft: null,
        category: "untrusted",
        summary: "Certificate isn’t trusted (self-signed)",
      },
      new Date("2026-10-25T10:00:00Z"),
    );

    const now = new Date("2026-10-26T10:00:00Z");
    expect(await incidentStateCounts(db, ctx, now)).toEqual({ open: 1, acknowledged: 0, muted: 0, resolved: 1 });
    expect((await listIncidents(db, ctx, { state: "resolved" }, now)).map((i) => i.id)).toEqual([incident.id]);
    expect(await listIncidents(db, ctx, { type: "ssl_invalid" }, now)).toHaveLength(1);
    expect(await listIncidents(db, ctx, { q: "harbour" }, now)).toHaveLength(2);
    expect(await listIncidents(db, ctx, { q: "nope" }, now)).toHaveLength(0);
    expect(await listIncidents(db, ctx, {}, new Date("2026-12-01T00:00:00Z"))).toHaveLength(1); // resolved one aged out
  });
});

describe("portfolio and manual checks", () => {
  it("ranks down sites first and counts quiet ones", async () => {
    const ctx = await workspaceWithOwner();
    await siteWithDowntime(ctx, "down.example.com");
    const u = normalizeSiteUrl("fine.example.com");
    if (!u.ok) throw new Error();
    const fine = await createSite(db, ctx, { url: u.value });
    await recordUptime(
      db,
      { id: fine.id, workspaceId: ctx.workspaceId, intervalMs: 120_000 },
      ok,
      new Date("2026-10-25T09:42:00Z"),
    );
    const p = await portfolio(db, ctx, 120_000, new Date("2026-10-25T09:43:00Z"));
    expect(p.dist).toMatchObject({ down: 1, up: 1 });
    expect(p.items[0]).toMatchObject({ rank: 0, severity: "critical", title: "Website down — HTTP 502 Bad Gateway" });
    expect(p).toMatchObject({ atRisk: 1, quiet: 1, unacknowledged: 1 });

    // An hour later with no new results everything is stale, not "up".
    const later = await portfolio(db, ctx, 120_000, new Date("2026-10-25T10:43:00Z"));
    expect(later.dist).toMatchObject({ up: 0, down: 0, unknown: 2 });
    expect(later.items.every((i) => i.title.startsWith("No recent results"))).toBe(true);
  });

  it("rate-limits Run check now and refuses paused sites", async () => {
    const ctx = await workspaceWithOwner();
    const u = normalizeSiteUrl("manual.example.com");
    if (!u.ok) throw new Error();
    const site = await createSite(db, ctx, { url: u.value });
    const now = new Date("2026-10-25T10:00:00Z");
    expect(await requestManualCheck(db, ctx, site.id, now)).toEqual({ queued: true });
    await expect(requestManualCheck(db, ctx, site.id, new Date(now.getTime() + 10_000))).rejects.toMatchObject({
      code: "rate_limited",
    });
    await db.job.updateMany({ data: { status: "completed", activeKey: null } });
    expect(await requestManualCheck(db, ctx, site.id, new Date(now.getTime() + 61_000))).toEqual({ queued: true });

    await pauseSites(db, ctx, [site.id]);
    await expect(requestManualCheck(db, ctx, site.id, new Date(now.getTime() + 200_000))).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("resets the shown status to Unknown when monitoring resumes", async () => {
    const ctx = await workspaceWithOwner();
    const { site } = await siteWithDowntime(ctx);
    await pauseSites(db, ctx, [site.id]);
    await resumeSites(db, ctx, [site.id]);
    expect(await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } })).toMatchObject({
      liveStatus: "unknown",
      consecutiveFailures: 0,
    });
  });
});
