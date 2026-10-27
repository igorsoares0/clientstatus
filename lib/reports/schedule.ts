import type { PrismaClient } from "@/lib/generated/prisma/client";
import { workspaceWithAccess } from "@/lib/billing/access";
import { UserFacingError } from "@/lib/data/errors";
import { currentMonth, localParts, previousMonth, type Period } from "@/lib/reports/period";

// Monthly reports are generated on the 1st at 06:00 workspace time for the
// previous month (catching up if the worker was down). Previews can be made
// on demand for the month so far and are never sent automatically.

function initials(s: string) {
  const letters = s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return letters.slice(0, 3) || "X";
}

export function reportCode(agency: string, client: string, period: Period, kind: "monthly" | "preview") {
  return `${initials(agency)}-${initials(client)}-${String(period.year).slice(2)}${String(period.month).padStart(2, "0")}${kind === "preview" ? "-P" : ""}`;
}

export async function createReport(
  db: PrismaClient,
  input: { workspaceId: string; clientId: string; period: Period; kind: "monthly" | "preview"; now: Date },
) {
  const [ws, client] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: input.workspaceId }, select: { name: true } }),
    db.client.findFirst({ where: { id: input.clientId, workspaceId: input.workspaceId }, select: { name: true } }),
  ]);
  if (!client) throw new UserFacingError("That client doesn’t exist.", "not_found");
  return db.$transaction(async (tx) => {
    const report = await tx.monthlyReport.create({
      data: {
        workspaceId: input.workspaceId,
        clientId: input.clientId,
        kind: input.kind,
        code: reportCode(ws.name, client.name, input.period, input.kind),
        periodStart: input.period.start,
        periodEnd: input.period.end,
        periodLabel: input.period.label,
      },
    });
    await tx.job.create({
      data: {
        workspaceId: input.workspaceId,
        jobType: "report_generate",
        resourceType: "report",
        resourceId: report.id,
        runAt: input.now,
        maxAttempts: 2,
        activeKey: `report_generate:${report.id}`,
      },
    });
    return report;
  });
}

/** Clients that had at least one website during the period. */
async function clientsWithSites(db: PrismaClient, workspaceId: string, period: Period) {
  return db.client.findMany({
    where: {
      workspaceId,
      status: "active",
      sites: {
        some: { createdAt: { lt: period.end }, OR: [{ archivedAt: null }, { archivedAt: { gte: period.start } }] },
      },
    },
    select: { id: true },
  });
}

export async function scheduleMonthlyReports(db: PrismaClient, now = new Date()) {
  // Workspaces without an active plan get no new reports; earlier ones stay readable.
  const workspaces = await db.workspace.findMany({
    where: workspaceWithAccess(now),
    select: { id: true, timezone: true },
  });
  let created = 0;
  for (const ws of workspaces) {
    const local = localParts(now, ws.timezone);
    if (local.day === 1 && local.hour < 6) continue;
    const period = previousMonth(now, ws.timezone);
    const clients = await clientsWithSites(db, ws.id, period);
    for (const c of clients) {
      const exists = await db.monthlyReport.findFirst({
        where: { clientId: c.id, periodStart: period.start, kind: "monthly" },
        select: { id: true },
      });
      if (exists) continue;
      await createReport(db, { workspaceId: ws.id, clientId: c.id, period, kind: "monthly", now });
      created++;
    }
  }
  return created;
}

/** On-demand preview of the current month so far (or a past month), held for review. */
export async function requestPreview(
  db: PrismaClient,
  workspaceId: string,
  clientId: string,
  now = new Date(),
  period?: Period,
) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
  const busy = await db.monthlyReport.findFirst({ where: { clientId, status: "generating" }, select: { id: true } });
  if (busy) throw new UserFacingError("A report for this client is already being generated.", "duplicate");
  return createReport(db, {
    workspaceId,
    clientId,
    period: period ?? currentMonth(now, ws.timezone),
    kind: "preview",
    now,
  });
}
