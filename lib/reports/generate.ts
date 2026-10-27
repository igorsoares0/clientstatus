import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { sanitizeError } from "@/lib/jobs/queue";
import { logger } from "@/lib/log";
import { getNotificationSettings } from "@/lib/notify/settings";
import { getPlan } from "@/lib/plans";
import { buildReportData, type ReportData } from "@/lib/reports/aggregate";
import { loadBranding } from "@/lib/reports/branding";
import { monthPeriod, zonedTimeToUtc } from "@/lib/reports/period";
import { htmlToPdf } from "@/lib/reports/pdf";
import { renderReportHtml, type Branding } from "@/lib/reports/render";
import { putObject } from "@/lib/storage";

const log = logger("reports");

export type StoredReport = ReportData & { code: string; branding: Branding };

/** Builds the data snapshot, renders the PDF, and decides whether it may auto-send. */
export async function generateReport(db: PrismaClient, reportId: string, deps: { now: () => Date }) {
  const report = await db.monthlyReport.findUnique({
    where: { id: reportId },
    include: { workspace: { select: { id: true, timezone: true, planKey: true, name: true } } },
  });
  if (!report || report.status !== "generating") return;
  const now = deps.now();
  const tz = report.workspace.timezone;
  const start = report.periodStart;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "numeric" }).formatToParts(
    new Date(start.getTime() + 12 * 3600_000),
  );
  const year = Number(local.find((p) => p.type === "year")!.value);
  const month = Number(local.find((p) => p.type === "month")!.value);
  const period = monthPeriod(year, month, tz);
  const previous = month === 1 ? monthPeriod(year - 1, 12, tz) : monthPeriod(year, month - 1, tz);

  try {
    const data = await buildReportData(db, {
      workspaceId: report.workspaceId,
      clientId: report.clientId,
      period,
      previous,
      tz,
      intervalMs: getPlan(report.workspace.planKey).uptimeIntervalSeconds * 1000,
      agencyName: report.workspace.name,
      kind: report.kind === "preview" ? "preview" : "monthly",
      now,
    });
    const branding = await loadBranding(db, report.workspaceId);
    const stored: StoredReport = { ...data, code: report.code, branding };

    if (data.noData) {
      await db.monthlyReport.update({
        where: { id: report.id },
        data: {
          status: "no_data",
          data: stored as unknown as Prisma.InputJsonValue,
          disclosures: data.disclosures,
          generatedAt: now,
        },
      });
      return;
    }

    const pdf = await htmlToPdf(renderReportHtml(stored, branding, { forPdf: true }), { code: report.code });
    const storageKey = `reports/${report.workspaceId}/${report.id}.pdf`;
    await putObject(storageKey, pdf);
    await db.monthlyReport.update({
      where: { id: report.id },
      data: {
        status: "needs_review",
        data: stored as unknown as Prisma.InputJsonValue,
        disclosures: data.disclosures,
        storageKey,
        generatedAt: now,
        errorSummary: null,
      },
    });
    log.info("report generated", { reportId: report.id, sites: data.sites.length, bytes: pdf.length });

    // Automatic delivery (opt-in): only clean monthly reports with confirmed recipients, at 07:00 local.
    if (report.kind === "monthly" && data.disclosures.length === 0) {
      const settings = await getNotificationSettings(db, report.workspaceId);
      if (settings.reportDelivery === "auto") {
        const recipients = await db.clientRecipient.findMany({
          where: { clientId: report.clientId },
          select: { confirmedAt: true, lastBouncedAt: true },
        });
        if (recipients.length && recipients.every((r) => r.confirmedAt && !r.lastBouncedAt)) {
          const p = new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            year: "numeric",
            month: "numeric",
            day: "numeric",
          }).formatToParts(now);
          const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
          const sendAt = zonedTimeToUtc(g("year"), g("month"), g("day"), 7, tz);
          await db.job.create({
            data: {
              workspaceId: report.workspaceId,
              jobType: "report_send",
              resourceType: "report",
              resourceId: report.id,
              runAt: sendAt > now ? sendAt : now,
              maxAttempts: 3,
              activeKey: `report_send:${report.id}`,
            },
          });
        }
      }
    }
  } catch (error) {
    log.error("report generation failed", { reportId: report.id, error });
    await db.monthlyReport.update({
      where: { id: report.id },
      data: { status: "failed", errorSummary: sanitizeError(error) },
    });
  }
}
