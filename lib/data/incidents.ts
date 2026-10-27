import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/generated/prisma/enums";
import { notFound, UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";

// Incidents (FR-INC-02..06). Every member may acknowledge, mute and add notes
// (Team permission matrix). There is no manual resolve — incidents resolve
// automatically from check results. Every change writes an event.

export const RESOLVED_WINDOW_DAYS = 30;

export function incidentCode(n: number) {
  return `INC-${String(n).padStart(4, "0")}`;
}

export async function siteIncidents(db: PrismaClient, ctx: TenantContext, siteId: string, take = 10) {
  return db.incident.findMany({
    where: { workspaceId: ctx.workspaceId, siteId },
    orderBy: [{ resolvedAt: { sort: "desc", nulls: "first" } }, { firstDetectedAt: "desc" }],
    take,
    select: {
      id: true,
      number: true,
      title: true,
      severity: true,
      status: true,
      firstDetectedAt: true,
      resolvedAt: true,
    },
  });
}

export async function unacknowledgedCount(db: PrismaClient, ctx: TenantContext) {
  return db.incident.count({ where: { workspaceId: ctx.workspaceId, status: "open" } });
}

export type IncidentFilters = {
  state?: "all" | IncidentStatus;
  severity?: IncidentSeverity;
  type?: IncidentType;
  siteId?: string;
  q?: string;
};

const listSelect = {
  id: true,
  number: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  firstDetectedAt: true,
  lastDetectedAt: true,
  resolvedAt: true,
  acknowledgedAt: true,
  site: { select: { id: true, name: true, normalizedHostname: true, client: { select: { name: true } } } },
} satisfies Prisma.IncidentSelect;

export type IncidentListItem = Prisma.IncidentGetPayload<{ select: typeof listSelect }>;

export async function listIncidents(db: PrismaClient, ctx: TenantContext, f: IncidentFilters, now = new Date()) {
  const q = f.q?.trim();
  const resolvedSince = new Date(now.getTime() - RESOLVED_WINDOW_DAYS * 86_400_000);
  const where: Prisma.IncidentWhereInput = {
    workspaceId: ctx.workspaceId,
    // Resolved incidents only from the last 30 days.
    OR: [{ status: { not: "resolved" } }, { resolvedAt: { gte: resolvedSince } }],
    ...(f.state && f.state !== "all" ? { status: f.state } : {}),
    ...(f.severity ? { severity: f.severity } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.siteId ? { siteId: f.siteId } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { site: { normalizedHostname: { contains: q.toLowerCase() } } },
                { site: { name: { contains: q, mode: "insensitive" } } },
                { site: { client: { name: { contains: q, mode: "insensitive" } } } },
              ],
            },
          ],
        }
      : {}),
  };
  return db.incident.findMany({ where, orderBy: [{ firstDetectedAt: "desc" }], take: 300, select: listSelect });
}

export async function incidentStateCounts(db: PrismaClient, ctx: TenantContext, now = new Date()) {
  const resolvedSince = new Date(now.getTime() - RESOLVED_WINDOW_DAYS * 86_400_000);
  const rows = await db.incident.groupBy({
    by: ["status"],
    where: {
      workspaceId: ctx.workspaceId,
      OR: [{ status: { not: "resolved" } }, { resolvedAt: { gte: resolvedSince } }],
    },
    _count: true,
  });
  const get = (s: IncidentStatus) => rows.find((r) => r.status === s)?._count ?? 0;
  return { open: get("open"), acknowledged: get("acknowledged"), muted: get("muted"), resolved: get("resolved") };
}

export async function getIncident(db: PrismaClient, ctx: TenantContext, incidentId: string) {
  const incident = await db.incident.findFirst({
    where: { id: incidentId, workspaceId: ctx.workspaceId },
    select: {
      ...listSelect,
      summary: true,
      site: {
        select: {
          id: true,
          name: true,
          normalizedHostname: true,
          status: true,
          client: { select: { name: true } },
          state: {
            select: {
              consecutiveSuccesses: true,
              nextCheckAt: true,
              nextSslCheckAt: true,
              nextDomainCheckAt: true,
              nextAuditAt: true,
              lastCheckAt: true,
            },
          },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          eventType: true,
          note: true,
          detail: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  });
  if (!incident) throw notFound("incident");
  return incident;
}

/** Checks for the incident's site during the incident window (for the event history and diagnosis). */
export async function incidentChecks(
  db: PrismaClient,
  ctx: TenantContext,
  incident: { site: { id: string }; type: IncidentType; firstDetectedAt: Date; resolvedAt: Date | null },
  now = new Date(),
) {
  // Audit incidents have no per-check history; their evidence is the findings list.
  if (incident.type === "audit_issue") return { checks: [], counts: { success: 0, failure: 0, inconclusive: 0 } };
  const checkType = incident.type === "downtime" ? "uptime" : incident.type === "domain_expiry" ? "domain" : "ssl";
  // Include the lead-up: failures before the incident opened are part of its story.
  const from = new Date(incident.firstDetectedAt.getTime() - (checkType === "uptime" ? 10 * 60_000 : 24 * 3600_000));
  const to = incident.resolvedAt ?? now;
  const checks = await db.monitorCheck.findMany({
    where: { workspaceId: ctx.workspaceId, siteId: incident.site.id, checkType, checkedAt: { gte: from, lte: to } },
    orderBy: { checkedAt: "desc" },
    take: 60,
    select: { id: true, status: true, summary: true, checkedAt: true },
  });
  const counts = { success: 0, failure: 0, inconclusive: 0 };
  for (const c of checks) if (c.checkedAt >= incident.firstDetectedAt || c.status === "failure") counts[c.status]++;
  return { checks, counts };
}

async function transition(
  db: PrismaClient,
  ctx: TenantContext,
  incidentId: string,
  allowed: IncidentStatus[],
  next: (current: { status: IncidentStatus; acknowledgedAt: Date | null }) => Prisma.IncidentUpdateInput,
  eventType: string,
  error: string,
  now: Date,
) {
  return db.$transaction(async (tx) => {
    const incident = await tx.incident.findFirst({
      where: { id: incidentId, workspaceId: ctx.workspaceId },
      select: { status: true, acknowledgedAt: true },
    });
    if (!incident) throw notFound("incident");
    if (!allowed.includes(incident.status)) throw new UserFacingError(error, "invalid");
    await tx.incident.update({ where: { id: incidentId }, data: next(incident) });
    await tx.incidentEvent.create({
      data: { workspaceId: ctx.workspaceId, incidentId, actorUserId: ctx.userId, eventType, createdAt: now },
    });
    return incident.status;
  });
}

export function acknowledgeIncident(db: PrismaClient, ctx: TenantContext, id: string, now = new Date()) {
  return transition(
    db,
    ctx,
    id,
    ["open"],
    () => ({ status: "acknowledged", acknowledgedAt: now }),
    "acknowledged",
    "Only open incidents can be acknowledged.",
    now,
  );
}

export function muteIncident(db: PrismaClient, ctx: TenantContext, id: string, now = new Date()) {
  return transition(
    db,
    ctx,
    id,
    ["open", "acknowledged"],
    () => ({ status: "muted" }),
    "muted",
    "This incident can’t be muted.",
    now,
  );
}

/** Back to acknowledged if it had been acknowledged before muting, otherwise open. */
export function unmuteIncident(db: PrismaClient, ctx: TenantContext, id: string, now = new Date()) {
  return transition(
    db,
    ctx,
    id,
    ["muted"],
    (c) => ({ status: c.acknowledgedAt ? "acknowledged" : "open" }),
    "unmuted",
    "This incident isn’t muted.",
    now,
  );
}

/** Undo for acknowledge: back to open. */
export function reopenAcknowledged(db: PrismaClient, ctx: TenantContext, id: string, now = new Date()) {
  return transition(
    db,
    ctx,
    id,
    ["acknowledged"],
    () => ({ status: "open", acknowledgedAt: null }),
    "unacknowledged",
    "This incident isn’t acknowledged.",
    now,
  );
}

export async function addIncidentNote(
  db: PrismaClient,
  ctx: TenantContext,
  id: string,
  note: string,
  now = new Date(),
) {
  const text = note.trim();
  if (!text) throw new UserFacingError("Write a note first.", "invalid");
  const incident = await db.incident.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true } });
  if (!incident) throw notFound("incident");
  await db.incidentEvent.create({
    data: {
      workspaceId: ctx.workspaceId,
      incidentId: id,
      actorUserId: ctx.userId,
      eventType: "note",
      note: text.slice(0, 2000),
      createdAt: now,
    },
  });
}
