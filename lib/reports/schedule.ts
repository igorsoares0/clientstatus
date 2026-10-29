import type { PrismaClient } from "@/lib/generated/prisma/client";
import { isPaidSubscription, workspaceWithAccess } from "@/lib/billing/access";
import { UserFacingError } from "@/lib/data/errors";
import { lockWorkspace, type Tx } from "@/lib/data/workspace-tx";
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

const DAY_MS = 86_400_000;
/** Preview renders one workspace may have queued or running at once. */
export const PREVIEWS_GENERATING_AT_ONCE = 3;
/** Previews per 24 hours: our free trial, and paid plans. */
export const TRIAL_PREVIEWS_PER_DAY = 20;
export const PAID_PREVIEWS_PER_DAY = 100;

type NewReport = { workspaceId: string; clientId: string; period: Period; kind: "monthly" | "preview"; now: Date };

export async function createReport(db: PrismaClient, input: NewReport) {
  return db.$transaction((tx) => insertReport(tx, input));
}

/** The report row and its generation job, inside the caller's transaction. */
async function insertReport(tx: Tx, input: NewReport) {
  const [ws, client] = await Promise.all([
    tx.workspace.findUniqueOrThrow({ where: { id: input.workspaceId }, select: { name: true } }),
    tx.client.findFirst({ where: { id: input.clientId, workspaceId: input.workspaceId }, select: { name: true } }),
  ]);
  if (!client) throw new UserFacingError("That client doesn’t exist.", "not_found");
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
      // Monthly reports have a 07:00 send time, so they go ahead of previews and audits in the lane.
      priority: input.kind === "monthly" ? 6 : 5,
      runAt: input.now,
      maxAttempts: 2,
      activeKey: `report_generate:${report.id}`,
    },
  });
  return report;
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
  return db.$transaction(async (tx) => {
    // Under the workspace lock, so a double click can't start two renders for the same client.
    await lockWorkspace(tx, workspaceId);
    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { timezone: true, subscription: { select: { status: true } } },
    });
    const busy = await tx.monthlyReport.findFirst({ where: { clientId, status: "generating" }, select: { id: true } });
    if (busy) throw new UserFacingError("A report for this client is already being generated.", "duplicate");
    // Renders share the worker's long-job lane with every workspace: cap what one workspace can queue.
    const generating = await tx.monthlyReport.count({ where: { workspaceId, kind: "preview", status: "generating" } });
    if (generating >= PREVIEWS_GENERATING_AT_ONCE) {
      throw new UserFacingError(
        `${PREVIEWS_GENERATING_AT_ONCE} previews are already being generated. Try again when one is ready.`,
        "rate_limited",
      );
    }
    const paid = isPaidSubscription(ws.subscription?.status);
    const perDay = paid ? PAID_PREVIEWS_PER_DAY : TRIAL_PREVIEWS_PER_DAY;
    const today = await tx.monthlyReport.count({
      where: { workspaceId, kind: "preview", createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    });
    if (today >= perDay) {
      throw new UserFacingError(
        paid
          ? `You’ve generated today’s ${perDay} previews. Try again tomorrow.`
          : `Trial workspaces can generate ${perDay} previews a day. Choose a plan in Billing for more, or try again tomorrow.`,
        "rate_limited",
      );
    }
    return insertReport(tx, {
      workspaceId,
      clientId,
      period: period ?? currentMonth(now, ws.timezone),
      kind: "preview",
      now,
    });
  });
}
