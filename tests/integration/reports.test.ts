import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/data/clients";
import type { TenantContext } from "@/lib/data/tenant";
import { buildReportData } from "@/lib/reports/aggregate";
import { generateReport } from "@/lib/reports/generate";
import { monthPeriod } from "@/lib/reports/period";
import { closePdfBrowser } from "@/lib/reports/pdf";
import { createReport, scheduleMonthlyReports } from "@/lib/reports/schedule";
import { revokeReportLink, rotateReportLink, sendReport } from "@/lib/reports/send";
import { findReportByToken } from "@/lib/data/reports";
import { db, resetDb, workspaceWithOwner } from "./helpers";

// Seeding two months of 2-minute checks and rendering PDFs takes a few seconds.
vi.setConfig({ testTimeout: 90_000 });

let storage = "";
beforeAll(() => {
  storage = mkdtempSync(path.join(tmpdir(), "cs-storage-"));
  process.env.STORAGE_DIR = storage;
});
afterAll(async () => {
  await closePdfBrowser();
  rmSync(storage, { recursive: true, force: true });
  await resetDb();
  await db.$disconnect();
});
beforeEach(resetDb);

const SEP = monthPeriod(2026, 9, "UTC");
const AUG = monthPeriod(2026, 8, "UTC");
const INTERVAL = 120_000;

/** A client with one site monitored since 1 Aug: every 2 min, one 26-minute outage on 17 Sep, a paused hour on 2 Sep. */
async function seedClient(ctx: TenantContext) {
  await db.workspace.update({ where: { id: ctx.workspaceId }, data: { timezone: "UTC" } });
  const client = await createClient(db, ctx, { name: "Harbour Dental Group", contactName: "Dr Sarah Okafor" });
  const site = await db.site.create({
    data: {
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      name: "Main website",
      nameKey: "main website",
      baseUrl: "https://harbourdental.co.uk",
      normalizedHostname: "harbourdental.co.uk",
      liveHostKey: "harbourdental.co.uk",
      registrableDomain: "harbourdental.co.uk",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    },
  });
  const outageStart = Date.parse("2026-09-17T10:00:00Z");
  const outageEnd = outageStart + 26 * 60_000;
  const pauseStart = Date.parse("2026-09-02T08:00:00Z");
  const pauseEnd = pauseStart + 60 * 60_000;
  const rows: {
    workspaceId: string;
    siteId: string;
    checkType: "uptime";
    status: "success" | "failure";
    checkedAt: Date;
    durationMs: number;
    summary: string;
  }[] = [];
  for (let t = AUG.start.getTime(); t < SEP.end.getTime(); t += INTERVAL) {
    if (t >= pauseStart && t < pauseEnd) continue;
    const down = t >= outageStart && t < outageEnd;
    rows.push({
      workspaceId: ctx.workspaceId,
      siteId: site.id,
      checkType: "uptime",
      status: down ? "failure" : "success",
      checkedAt: new Date(t),
      durationMs: t < SEP.start.getTime() ? 300 : 250,
      summary: down ? "HTTP 502" : "HTTP 200",
    });
  }
  for (let i = 0; i < rows.length; i += 5000) await db.monitorCheck.createMany({ data: rows.slice(i, i + 5000) });
  await db.auditLog.createMany({
    data: [
      {
        workspaceId: ctx.workspaceId,
        action: "site.paused",
        resourceType: "site",
        resourceId: site.id,
        createdAt: new Date(pauseStart),
      },
      {
        workspaceId: ctx.workspaceId,
        action: "site.resumed",
        resourceType: "site",
        resourceId: site.id,
        createdAt: new Date(pauseEnd),
      },
    ],
  });
  await db.incident.create({
    data: {
      workspaceId: ctx.workspaceId,
      siteId: site.id,
      number: 1,
      type: "downtime",
      severity: "critical",
      status: "resolved",
      title: "Website down — HTTP 502 Bad Gateway",
      summary: "HTTP 502",
      firstDetectedAt: new Date(outageStart),
      lastDetectedAt: new Date(outageEnd),
      resolvedAt: new Date(outageEnd),
    },
  });
  await db.monitorCheck.create({
    data: {
      workspaceId: ctx.workspaceId,
      siteId: site.id,
      checkType: "ssl",
      status: "success",
      checkedAt: new Date("2026-09-30T18:00:00Z"),
      summary: "Valid (Let's Encrypt) · 47 days remaining",
      metadata: { expiresAt: "2026-11-16T00:00:00Z", issuer: "Let's Encrypt" },
    },
  });
  await db.monitorCheck.create({
    data: {
      workspaceId: ctx.workspaceId,
      siteId: site.id,
      checkType: "domain",
      status: "success",
      checkedAt: new Date("2026-09-30T02:00:00Z"),
      summary: "Registered until 27 Sep 2027",
      metadata: { expiresAt: "2027-09-27T00:00:00Z", source: "rdap.nominet.uk RDAP" },
    },
  });
  const run = await db.auditRun.create({
    data: {
      workspaceId: ctx.workspaceId,
      siteId: site.id,
      status: "completed",
      trigger: "scheduled",
      startedAt: new Date("2026-09-26T03:00:00Z"),
      completedAt: new Date("2026-09-26T03:20:00Z"),
      pagesVisited: 42,
      pagesBudget: 1500,
      linksChecked: 300,
    },
  });
  await db.auditFinding.createMany({
    data: [
      {
        workspaceId: ctx.workspaceId,
        siteId: site.id,
        auditRunId: run.id,
        key: "a",
        type: "broken_link",
        severity: "high",
        sourceUrl: "https://harbourdental.co.uk/services",
        targetUrl: "https://harbourdental.co.uk/old",
        summary: "Broken internal link",
        firstSeenAt: new Date("2026-09-19T03:10:00Z"),
        lastSeenAt: new Date("2026-09-26T03:10:00Z"),
      },
      {
        workspaceId: ctx.workspaceId,
        siteId: site.id,
        auditRunId: run.id,
        key: "b",
        type: "missing_meta_description",
        severity: "low",
        sourceUrl: "https://harbourdental.co.uk/contact",
        targetUrl: null,
        summary: "Missing meta description",
        firstSeenAt: new Date("2026-09-26T03:10:00Z"),
        lastSeenAt: new Date("2026-09-26T03:10:00Z"),
      },
      // Resolved before this audit: must not appear.
      {
        workspaceId: ctx.workspaceId,
        siteId: site.id,
        auditRunId: run.id,
        key: "c",
        type: "missing_title",
        severity: "medium",
        sourceUrl: "https://harbourdental.co.uk/x",
        targetUrl: null,
        summary: "Missing title",
        firstSeenAt: new Date("2026-09-05T03:10:00Z"),
        lastSeenAt: new Date("2026-09-12T03:10:00Z"),
        resolvedAt: new Date("2026-09-19T03:10:00Z"),
      },
    ],
  });
  return { client, site };
}

describe("report data", () => {
  it("summarises the month from history and discloses gaps", async () => {
    const ctx = await workspaceWithOwner("Northfold");
    const { client } = await seedClient(ctx);
    const data = await buildReportData(db, {
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      period: SEP,
      previous: AUG,
      tz: "UTC",
      intervalMs: INTERVAL,
      agencyName: "Northfold Studio",
      kind: "monthly",
      now: new Date("2026-10-01T06:00:00Z"),
    });
    const s = data.sites[0];
    expect(s.downtimeMinutes).toBe(26);
    expect(s.pausedMinutes).toBe(60);
    expect(s.expected).toBe(21600 - 30);
    expect(s.completed).toBe(21570);
    expect(s.uptimePct).toBeCloseTo(((21570 - 13) / 21570) * 100, 5);
    expect(s.prevUptimePct).toBe(100);
    expect(s.coveragePct).toBe(100);
    expect(s.days[16]).toBe("down");
    expect(s.days[0]).toBe("ok");
    expect(s.respMedian).toBe(250);
    expect(s.prevRespMedian).toBe(300);
    expect(s.ssl).toMatchObject({ status: "valid", expiresAt: "2026-11-16T00:00:00Z" });
    expect(s.audit).toMatchObject({ pages: 42, status: "completed" });
    expect(data.findings.map((f) => [f.priority, f.label, f.count])).toEqual([
      ["fix", "Broken links", 1],
      ["improve", "Pages without a meta description", 1],
    ]);
    expect(data.incidents).toHaveLength(1);
    expect(data.dates.map((d) => d.text)).toEqual(["SSL certificate expires — harbourdental.co.uk"]);
    expect(data.disclosures).toEqual([
      "harbourdental.co.uk: monitoring was paused for 1 h — that time is a gap, not counted as up.",
    ]);
    expect(data.summary[0]).toBe("Main website had 26 min of confirmed downtime in September.");
    expect(data.noData).toBe(false);
  });
});

describe("report generation and delivery", () => {
  it("renders a PDF, requires recipient confirmation, and serves a private, revocable link", async () => {
    const ctx = await workspaceWithOwner("Northfold");
    const { client } = await seedClient(ctx);
    const report = await createReport(db, {
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      period: SEP,
      kind: "monthly",
      now: new Date("2026-10-01T06:00:00Z"),
    });
    await generateReport(db, report.id, { now: () => new Date("2026-10-01T06:00:05Z") });

    const ready = await db.monthlyReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(ready).toMatchObject({ status: "needs_review", code: "NA-HDG-2609" });
    const pdf = await readFile(path.join(storage, ready.storageKey!));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);

    const r1 = await db.clientRecipient.create({
      data: { workspaceId: ctx.workspaceId, clientId: client.id, email: "sarah@harbour.example", name: "Sarah" },
    });
    const now = () => new Date("2026-10-01T09:00:00Z");
    await expect(sendReport(db, report.id, { now, recipientIds: [r1.id] })).rejects.toMatchObject({
      message: "Confirm the recipients before the first delivery.",
    });
    const { token, sent } = await sendReport(db, report.id, {
      now,
      recipientIds: [r1.id],
      confirmRecipients: true,
      linkDays: 30,
    });
    expect(sent).toBe(1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await db.clientRecipient.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({ confirmedAt: now() });
    const mail = await db.emailDelivery.findFirstOrThrow({ where: { reportId: report.id } });
    expect(mail).toMatchObject({
      recipient: "sarah@harbour.example",
      attachmentKey: ready.storageKey,
      attachmentName: "harbour-dental-group-september-2026-website-health.pdf",
    });
    expect(mail.textBody).toContain(`/r/${token}`);
    const stored = await db.monthlyReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(stored.privateTokenHash).not.toContain(token!);

    expect((await findReportByToken(db, token!, new Date("2026-10-15T00:00:00Z")))?.id).toBe(report.id);
    expect(await findReportByToken(db, token!, new Date("2026-11-01T00:00:00Z"))).toBeNull(); // expired after 30 days
    const fresh = await rotateReportLink(db, report.id, ctx.workspaceId, 30, new Date("2026-10-02T00:00:00Z"));
    expect(await findReportByToken(db, token!, new Date("2026-10-03T00:00:00Z"))).toBeNull();
    expect((await findReportByToken(db, fresh, new Date("2026-10-03T00:00:00Z")))?.id).toBe(report.id);
    await revokeReportLink(db, report.id, ctx.workspaceId);
    expect(await findReportByToken(db, fresh, new Date("2026-10-03T00:00:00Z"))).toBeNull();
  });

  it("marks clients without any checks as no data instead of inventing figures", async () => {
    const ctx = await workspaceWithOwner();
    await db.workspace.update({ where: { id: ctx.workspaceId }, data: { timezone: "UTC" } });
    const client = await createClient(db, ctx, { name: "Empty Co" });
    await db.site.create({
      data: {
        workspaceId: ctx.workspaceId,
        clientId: client.id,
        name: "e",
        nameKey: "e",
        baseUrl: "https://e.example.com",
        normalizedHostname: "e.example.com",
        liveHostKey: "e.example.com",
        createdAt: new Date("2026-09-20T00:00:00Z"),
      },
    });
    const report = await createReport(db, {
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      period: SEP,
      kind: "monthly",
      now: new Date("2026-10-01T06:00:00Z"),
    });
    await generateReport(db, report.id, { now: () => new Date("2026-10-01T06:00:05Z") });
    const r = await db.monthlyReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(r).toMatchObject({ status: "no_data", storageKey: null });
    expect(r.disclosures.join(" ")).toMatch(/no checks ran/);
  });
});

describe("monthly scheduling", () => {
  it("creates last month's reports from 06:00 on the 1st, once, and queues auto-send only for clean reports", async () => {
    const ctx = await workspaceWithOwner("Northfold");
    const { client } = await seedClient(ctx);
    await createClient(db, ctx, { name: "No sites yet" });
    expect(await scheduleMonthlyReports(db, new Date("2026-10-01T05:59:00Z"))).toBe(0);
    expect(await scheduleMonthlyReports(db, new Date("2026-10-01T06:00:00Z"))).toBe(1);
    expect(await scheduleMonthlyReports(db, new Date("2026-10-01T06:10:00Z"))).toBe(0);
    const report = await db.monthlyReport.findFirstOrThrow({ where: { clientId: client.id } });
    expect(report).toMatchObject({ periodLabel: "September 2026", kind: "monthly", status: "generating" });
    expect(await db.job.count({ where: { jobType: "report_generate", resourceId: report.id } })).toBe(1);

    // Opt in to auto-send with a confirmed recipient: the paused hour is a disclosure, so it's still held.
    await db.notificationSettings.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: { workspaceId: ctx.workspaceId, recipientUserIds: [], events: {}, reportDelivery: "auto" },
      update: { reportDelivery: "auto" },
    });
    await db.clientRecipient.create({
      data: {
        workspaceId: ctx.workspaceId,
        clientId: client.id,
        email: "sarah@harbour.example",
        confirmedAt: new Date(),
      },
    });
    await generateReport(db, report.id, { now: () => new Date("2026-10-01T06:01:00Z") });
    expect(await db.job.count({ where: { jobType: "report_send" } })).toBe(0);

    // Without the gap it would be queued for 07:00.
    await db.auditLog.deleteMany({ where: { action: { in: ["site.paused", "site.resumed"] } } });
    await db.monthlyReport.update({ where: { id: report.id }, data: { status: "generating" } });
    await generateReport(db, report.id, { now: () => new Date("2026-10-01T06:02:00Z") });
    const send = await db.job.findFirstOrThrow({ where: { jobType: "report_send" } });
    expect(send.runAt.toISOString()).toBe("2026-10-01T07:00:00.000Z");
  });
});
