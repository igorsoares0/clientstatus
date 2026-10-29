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
import {
  createReport,
  PREVIEWS_GENERATING_AT_ONCE,
  requestPreview,
  scheduleMonthlyReports,
  TRIAL_PREVIEWS_PER_DAY,
} from "@/lib/reports/schedule";
import { revokeReportLink, rotateReportLink, sendReport, TRIAL_REPORT_EMAILS_PER_DAY } from "@/lib/reports/send";
import { addRecipient, findReportByToken } from "@/lib/data/reports";
import type { OutgoingEmail } from "@/lib/email";
import { sendQueuedEmail } from "@/lib/notify/send";
import { openReportToken, REPORT_TOKEN_PLACEHOLDER } from "@/lib/reports/token";
import { db, resetDb, workspaceWithOwner } from "./helpers";

// Seeding two months of 2-minute checks and rendering PDFs takes a few seconds.
vi.setConfig({ testTimeout: 90_000 });

// Captures what would go to the provider, so tests can see the email as sent.
const sendEmail = vi.hoisted(() =>
  vi.fn<(email: OutgoingEmail) => Promise<{ providerMessageId: string | null }>>(async () => ({
    providerMessageId: "msg_test",
  })),
);
vi.mock("@/lib/email", async (original) => ({ ...(await original<typeof import("@/lib/email")>()), sendEmail }));

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
    // Stored rows never hold the token in the clear: a placeholder, and the token sealed to this report.
    for (const column of [mail.textBody, mail.htmlBody, mail.linkTokenSealed!]) expect(column).not.toContain(token!);
    expect(mail.textBody).toContain(`/r/${REPORT_TOKEN_PLACEHOLDER}`);
    expect(() => openReportToken(mail.linkTokenSealed!, "another-report")).toThrow();
    await sendQueuedEmail(db, mail.id, now());
    const delivered = sendEmail.mock.calls.at(-1)![0];
    expect(delivered.text).toContain(`/r/${token}`);
    expect(delivered.html).toContain(`/r/${token}`);
    expect(delivered.text).not.toContain(REPORT_TOKEN_PLACEHOLDER);
    expect(await db.emailDelivery.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "sent",
      linkTokenSealed: null,
    });
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

  it("limits how often a report goes to the same person and how many report emails a trial sends a day", async () => {
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
    const r1 = await db.clientRecipient.create({
      data: {
        workspaceId: ctx.workspaceId,
        clientId: client.id,
        email: "sarah@harbour.example",
        confirmedAt: new Date(),
      },
    });
    const send = (at: string) => sendReport(db, report.id, { now: () => new Date(at), recipientIds: [r1.id] });

    await send("2026-10-01T09:00:00Z");
    await send("2026-10-01T10:00:00Z");
    await expect(send("2026-10-01T11:00:00Z")).rejects.toMatchObject({ code: "rate_limited" });
    expect((await send("2026-10-02T10:30:00Z")).sent).toBe(1); // a day after the first send

    // A trial's daily allowance counts every report email in the workspace.
    await db.emailDelivery.createMany({
      data: Array.from({ length: TRIAL_REPORT_EMAILS_PER_DAY }, (_, i) => ({
        workspaceId: ctx.workspaceId,
        recipient: `other${i}@example.com`,
        templateType: "report",
        deduplicationKey: `seed:${i}`,
        subject: "s",
        textBody: "t",
        htmlBody: "h",
        scheduledAt: new Date("2026-10-05T08:00:00Z"),
      })),
    });
    await expect(send("2026-10-05T09:00:00Z")).rejects.toMatchObject({
      code: "rate_limited",
      message: expect.stringMatching(/^Trial workspaces can send up to 25/),
    });
  });

  it("serialises recipient adds and preview requests, so limits hold under concurrency", async () => {
    const ctx = await workspaceWithOwner("Northfold");
    const { client } = await seedClient(ctx);
    const adds = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) => addRecipient(db, ctx, client.id, { email: `r${i}@example.com` })),
    );
    expect(adds.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await db.clientRecipient.count({ where: { clientId: client.id } })).toBe(10);

    const previews = await Promise.allSettled(
      Array.from({ length: 5 }, () => requestPreview(db, ctx.workspaceId, client.id, new Date("2026-10-10T12:00:00Z"))),
    );
    expect(previews.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.monthlyReport.count({ where: { clientId: client.id, kind: "preview" } })).toBe(1);
  });

  it("caps the previews one workspace can queue, and puts monthly reports first in the lane", async () => {
    const ctx = await workspaceWithOwner("Northfold");
    const clients: { id: string }[] = [];
    for (let i = 0; i < 4; i++) clients.push(await createClient(db, ctx, { name: `Client ${i}` }));
    const now = new Date();
    for (const c of clients.slice(0, PREVIEWS_GENERATING_AT_ONCE)) await requestPreview(db, ctx.workspaceId, c.id, now);
    await expect(requestPreview(db, ctx.workspaceId, clients[3]!.id, now)).rejects.toMatchObject({
      code: "rate_limited",
    });

    // Once renders finish, the trial's daily allowance still applies.
    await db.monthlyReport.updateMany({ where: { workspaceId: ctx.workspaceId }, data: { status: "needs_review" } });
    await db.monthlyReport.createMany({
      data: Array.from({ length: TRIAL_PREVIEWS_PER_DAY - PREVIEWS_GENERATING_AT_ONCE }, (_, i) => ({
        workspaceId: ctx.workspaceId,
        clientId: clients[0]!.id,
        kind: "preview",
        code: `SEED-${i}`,
        periodStart: SEP.start,
        periodEnd: SEP.end,
        periodLabel: SEP.label,
        status: "needs_review" as const,
      })),
    });
    await expect(requestPreview(db, ctx.workspaceId, clients[3]!.id, now)).rejects.toMatchObject({
      code: "rate_limited",
      message: expect.stringMatching(/^Trial workspaces can generate 20 previews a day/),
    });

    const monthly = await createReport(db, {
      workspaceId: ctx.workspaceId,
      clientId: clients[3]!.id,
      period: SEP,
      kind: "monthly",
      now,
    });
    const jobs = await db.job.findMany({ where: { workspaceId: ctx.workspaceId, jobType: "report_generate" } });
    const monthlyJob = jobs.find((j) => j.resourceId === monthly.id)!;
    expect(jobs.filter((j) => j !== monthlyJob).every((j) => j.priority < monthlyJob.priority)).toBe(true);
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
