import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestManualAudit, latestAudit, openFindings } from "@/lib/data/audits";
import {
  archiveClient,
  createClient,
  getClient,
  restoreClient,
  updateClient,
  updateClientNotes,
} from "@/lib/data/clients";
import { UserFacingError } from "@/lib/data/errors";
import {
  acknowledgeIncident,
  addIncidentNote,
  getIncident,
  muteIncident,
  siteIncidents,
  unmuteIncident,
} from "@/lib/data/incidents";
import { requestManualCheck } from "@/lib/data/monitoring";
import { addRecipient, getReport, listRecipients, removeRecipient } from "@/lib/data/reports";
import {
  archiveSite,
  createSite,
  getSite,
  pauseSites,
  restoreSite,
  resumeSites,
  updateSiteSettings,
} from "@/lib/data/sites";
import { ForbiddenError, type TenantContext } from "@/lib/data/tenant";
import { recordUptime } from "@/lib/monitoring/apply";
import { revokeReportLink, rotateReportLink } from "@/lib/reports/send";
import { createReport } from "@/lib/reports/schedule";
import { monthPeriod } from "@/lib/reports/period";
import { normalizeSiteUrl } from "@/lib/url";
import { db, resetDb, workspaceWithOwner } from "./helpers";

// Spec §13 "Cross-tenant IDOR tests": a member of workspace A holding the ids
// of workspace B's resources can neither read nor change them, through any
// data function. B's rows are compared before and after.

type Fixture = {
  ctx: TenantContext;
  siteId: string;
  clientId: string;
  incidentId: string;
  reportId: string;
  recipientId: string;
};

async function workspaceWithEverything(name: string, host: string): Promise<Fixture> {
  const ctx = await workspaceWithOwner(name);
  const client = await createClient(db, ctx, { name: `${name} Client` });
  const u = normalizeSiteUrl(host);
  if (!u.ok) throw new Error(u.error);
  const site = await createSite(db, ctx, { url: u.value, clientId: client.id });
  const ref = { id: site.id, workspaceId: ctx.workspaceId, intervalMs: 120_000 };
  const fail = {
    status: "failure",
    category: "http_5xx",
    summary: "HTTP 502",
    httpStatus: 502,
    durationMs: 90,
    slow: false,
  } as const;
  await recordUptime(db, ref, fail, new Date(Date.now() - 60_000));
  await recordUptime(db, ref, fail, new Date());
  const incident = await db.incident.findFirstOrThrow({ where: { siteId: site.id } });
  const recipient = await addRecipient(db, ctx, client.id, { email: `client@${host}` });
  const report = await createReport(db, {
    workspaceId: ctx.workspaceId,
    clientId: client.id,
    period: monthPeriod(2026, 9, "UTC"),
    kind: "monthly",
    now: new Date(),
  });
  return {
    ctx,
    siteId: site.id,
    clientId: client.id,
    incidentId: incident.id,
    reportId: report.id,
    recipientId: recipient.id,
  };
}

async function snapshot(workspaceId: string) {
  const [workspace, sites, clients, incidents, events, reports, recipients] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    db.site.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.client.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.incident.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.incidentEvent.count({ where: { incident: { workspaceId } } }),
    db.monthlyReport.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.clientRecipient.findMany({ where: { client: { workspaceId } }, orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ workspace, sites, clients, incidents, events, reports, recipients });
}

/** Denied = rejected as not found / forbidden, or nothing returned or changed. */
async function expectDenied(label: string, run: () => Promise<unknown>) {
  let value: unknown;
  try {
    value = await run();
  } catch (error) {
    const ok =
      error instanceof ForbiddenError ||
      (error instanceof UserFacingError && ["not_found", "invalid", "forbidden"].includes(error.code));
    expect(ok, `${label} threw an unexpected error: ${String(error)}`).toBe(true);
    return;
  }
  const empty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      value !== null &&
      "changed" in value &&
      (value as { changed: unknown[] }).changed.length === 0) ||
    (typeof value === "number" && value === 0) ||
    (typeof value === "object" &&
      value !== null &&
      "items" in value &&
      (value as { items: unknown[] }).items.length === 0);
  expect(empty, `${label} returned data from another workspace: ${JSON.stringify(value)}`).toBe(true);
}

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  await resetDb();
  a = await workspaceWithEverything("Alpha", "alpha-agency.co.uk");
  b = await workspaceWithEverything("Bravo", "bravo-agency.co.uk");
});
afterAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "job" CASCADE');
  await db.$disconnect();
});

describe("cross-tenant access", () => {
  it("every data function refuses workspace B's ids for a member of workspace A", async () => {
    const before = await snapshot(b.ctx.workspaceId);
    const ctx = a.ctx;
    const attempts: [string, () => Promise<unknown>][] = [
      ["getSite", () => getSite(db, ctx, b.siteId)],
      [
        "updateSiteSettings",
        () =>
          updateSiteSettings(db, ctx, b.siteId, {
            name: "x",
            clientId: null,
            timeoutMs: 10_000,
            downPolicy: "server_errors",
          }),
      ],
      ["pauseSites", () => pauseSites(db, ctx, [b.siteId])],
      ["resumeSites", () => resumeSites(db, ctx, [b.siteId])],
      ["archiveSite", () => archiveSite(db, ctx, b.siteId)],
      ["restoreSite", () => restoreSite(db, ctx, b.siteId)],
      ["requestManualCheck", () => requestManualCheck(db, ctx, b.siteId)],
      ["requestManualAudit", () => requestManualAudit(db, ctx, b.siteId)],
      ["siteIncidents", () => siteIncidents(db, ctx, b.siteId)],
      ["latestAudit", () => latestAudit(db, ctx, b.siteId)],
      ["openFindings", () => openFindings(db, ctx, b.siteId)],
      ["getClient", () => getClient(db, ctx, b.clientId)],
      ["updateClient", () => updateClient(db, ctx, b.clientId, { name: "Hijacked" })],
      ["updateClientNotes", () => updateClientNotes(db, ctx, b.clientId, "hijacked")],
      ["archiveClient", () => archiveClient(db, ctx, b.clientId, "unassign")],
      ["restoreClient", () => restoreClient(db, ctx, b.clientId)],
      [
        "createSite with B's client",
        async () => {
          const u = normalizeSiteUrl("sneaky.example.com");
          if (!u.ok) throw new Error(u.error);
          return createSite(db, ctx, { url: u.value, clientId: b.clientId });
        },
      ],
      ["getIncident", () => getIncident(db, ctx, b.incidentId)],
      ["acknowledgeIncident", () => acknowledgeIncident(db, ctx, b.incidentId)],
      ["muteIncident", () => muteIncident(db, ctx, b.incidentId)],
      ["unmuteIncident", () => unmuteIncident(db, ctx, b.incidentId)],
      ["addIncidentNote", () => addIncidentNote(db, ctx, b.incidentId, "hijacked")],
      ["getReport", () => getReport(db, ctx, b.reportId)],
      ["listRecipients", () => listRecipients(db, ctx, b.clientId)],
      ["addRecipient", () => addRecipient(db, ctx, b.clientId, { email: "attacker@example.com" })],
      ["removeRecipient", () => removeRecipient(db, ctx, b.recipientId)],
      ["rotateReportLink", () => rotateReportLink(db, b.reportId, ctx.workspaceId, 30)],
      ["revokeReportLink", () => revokeReportLink(db, b.reportId, ctx.workspaceId)],
    ];
    for (const [label, run] of attempts) await expectDenied(label, run);
    expect(await snapshot(b.ctx.workspaceId)).toBe(before);
  });

  it("the same calls work on the caller's own resources (the test isn't vacuous)", async () => {
    expect(await getSite(db, a.ctx, a.siteId)).not.toBeNull();
    expect(await getClient(db, a.ctx, a.clientId)).not.toBeNull();
    expect(await getIncident(db, a.ctx, a.incidentId)).not.toBeNull();
    await expect(getReport(db, a.ctx, a.reportId)).resolves.toMatchObject({ id: a.reportId });
    expect(await listRecipients(db, a.ctx, a.clientId)).toHaveLength(1);
  });
});
