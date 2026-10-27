import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DownPolicy, SiteStatus } from "@/lib/generated/prisma/enums";
import { findOrCreateClientByName } from "@/lib/data/clients";
import { notFound, UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";
import { lockWorkspace, recordAudit, type Tx } from "@/lib/data/workspace-tx";
import { getPlan } from "@/lib/plans";
import { defaultSiteName, type NormalizedUrl } from "@/lib/url";

// Websites (FR-SITE-01..09). Every member may add, edit and pause websites
// (Team permission matrix). Plan limits count *active* sites only and are
// checked inside a workspace-locked transaction (FR-SITE-07, FR-BILL-03).

export const TIMEOUT_OPTIONS_MS = [5000, 10000, 15000, 20000] as const;

export function siteNameKey(name: string): string {
  return name.trim().toLowerCase();
}

async function planFor(tx: Tx, workspaceId: string) {
  const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { planKey: true } });
  return getPlan(ws.planKey);
}

async function activeCount(tx: Tx, workspaceId: string) {
  return tx.site.count({ where: { workspaceId, status: "active" } });
}

function planLimitError(planName: string, max: number) {
  return new UserFacingError(
    `Your plan is full (${max} sites on ${planName}). Pause a site or upgrade first.`,
    "plan_limit",
  );
}

async function assertClientUsable(tx: Tx, ctx: TenantContext, clientId: string) {
  const client = await tx.client.findFirst({
    where: { id: clientId, workspaceId: ctx.workspaceId },
    select: { status: true },
  });
  if (!client) throw notFound("client");
  if (client.status === "archived") throw new UserFacingError("That client is archived.", "invalid", "client");
}

/**
 * After a pause or archive, the last result is no longer current: show Unknown
 * until the next check, which is due now (design: "Status shows Unknown until
 * each first result arrives").
 */
async function resetMonitoringState(tx: Tx, siteIds: string[]) {
  const now = new Date();
  await tx.siteState.updateMany({
    where: { siteId: { in: siteIds } },
    data: {
      liveStatus: "unknown",
      statusRank: 2,
      statusDetail: null,
      statusSince: now,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      nextCheckAt: now,
      nextSslCheckAt: now,
    },
  });
}

function isLiveHostConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type NewSite = {
  url: NormalizedUrl;
  name?: string;
  /** Existing client id… */
  clientId?: string | null;
  /** …or a client name to find or create (Admin+ to create). */
  clientName?: string | null;
};

export async function createSite(db: PrismaClient, ctx: TenantContext, input: NewSite) {
  try {
    return await db.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx.workspaceId);
      const existing = await tx.site.findFirst({
        where: { workspaceId: ctx.workspaceId, liveHostKey: input.url.hostname },
        select: { status: true },
      });
      if (existing) {
        const where = existing.status === "paused" ? " (paused)" : "";
        throw new UserFacingError(`${input.url.hostname} is already monitored${where}.`, "duplicate", "url");
      }
      const plan = await planFor(tx, ctx.workspaceId);
      if ((await activeCount(tx, ctx.workspaceId)) >= plan.maxActiveSites)
        throw planLimitError(plan.name, plan.maxActiveSites);

      let clientId: string | null = null;
      if (input.clientId) {
        await assertClientUsable(tx, ctx, input.clientId);
        clientId = input.clientId;
      } else if (input.clientName?.trim()) {
        clientId = await findOrCreateClientByName(tx, ctx, input.clientName);
      }

      const name = input.name?.trim() || defaultSiteName(input.url);
      const site = await tx.site.create({
        data: {
          workspaceId: ctx.workspaceId,
          clientId,
          name,
          nameKey: siteNameKey(name),
          baseUrl: input.url.baseUrl,
          normalizedHostname: input.url.hostname,
          registrableDomain: input.url.registrableDomain,
          liveHostKey: input.url.hostname,
        },
        select: { id: true, name: true, normalizedHostname: true },
      });
      // First uptime, SSL and domain checks are due immediately.
      await tx.siteState.create({ data: { siteId: site.id, workspaceId: ctx.workspaceId } });
      await recordAudit(tx, ctx, "site.created", "site", site.id, { hostname: site.normalizedHostname });
      return site;
    });
  } catch (error) {
    if (isLiveHostConflict(error)) {
      throw new UserFacingError(`${input.url.hostname} is already monitored.`, "duplicate", "url");
    }
    throw error;
  }
}

export type SiteSettings = {
  name: string;
  clientId: string | null;
  timeoutMs: number;
  downPolicy: DownPolicy;
  /** Crawl setting: follow robots.txt when auditing (default true, FR-CRAWL-06). */
  respectRobots?: boolean;
  /** Per-site alert override (FR-NOT-02). */
  alertsEnabled?: boolean;
};

export async function updateSiteSettings(db: PrismaClient, ctx: TenantContext, siteId: string, input: SiteSettings) {
  if (!TIMEOUT_OPTIONS_MS.includes(input.timeoutMs as (typeof TIMEOUT_OPTIONS_MS)[number])) {
    throw new UserFacingError("Choose one of the listed timeouts.", "invalid", "timeoutMs");
  }
  await db.$transaction(async (tx) => {
    const site = await tx.site.findFirst({
      where: { id: siteId, workspaceId: ctx.workspaceId },
      select: { clientId: true, crawlConfig: true },
    });
    if (!site) throw notFound("website");
    if (input.clientId && input.clientId !== site.clientId) await assertClientUsable(tx, ctx, input.clientId);
    await tx.site.update({
      where: { id: siteId },
      data: {
        name: input.name.trim(),
        nameKey: siteNameKey(input.name),
        clientId: input.clientId,
        timeoutMs: input.timeoutMs,
        downPolicy: input.downPolicy,
        ...(input.alertsEnabled === undefined ? {} : { alertsEnabled: input.alertsEnabled }),
        ...(input.respectRobots === undefined
          ? {}
          : { crawlConfig: { ...((site.crawlConfig as object | null) ?? {}), respectRobots: input.respectRobots } }),
      },
    });
    await recordAudit(tx, ctx, "site.updated", "site", siteId);
  });
}

export type BulkResult = { changed: string[]; skipped: number };

/** Pauses the given sites; ones already paused or archived are skipped. */
export async function pauseSites(
  db: PrismaClient,
  ctx: TenantContext,
  siteIds: string[],
  now = new Date(),
): Promise<BulkResult> {
  return db.$transaction(async (tx) => {
    const targets = await tx.site.findMany({
      where: { id: { in: siteIds }, workspaceId: ctx.workspaceId, status: "active" },
      select: { id: true },
    });
    const ids = targets.map((t) => t.id);
    if (ids.length) {
      await tx.site.updateMany({
        where: { id: { in: ids } },
        data: { status: "paused", pausedAt: now, pausedById: ctx.userId },
      });
      for (const id of ids) await recordAudit(tx, ctx, "site.paused", "site", id);
    }
    return { changed: ids, skipped: siteIds.length - ids.length };
  });
}

/** Resumes paused sites if every one fits in the plan; otherwise nothing changes. */
export async function resumeSites(db: PrismaClient, ctx: TenantContext, siteIds: string[]): Promise<BulkResult> {
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, ctx.workspaceId);
    const targets = await tx.site.findMany({
      where: { id: { in: siteIds }, workspaceId: ctx.workspaceId, status: "paused" },
      select: { id: true },
    });
    const ids = targets.map((t) => t.id);
    if (ids.length) {
      const plan = await planFor(tx, ctx.workspaceId);
      const free = plan.maxActiveSites - (await activeCount(tx, ctx.workspaceId));
      if (ids.length > free) {
        throw new UserFacingError(
          `Only ${Math.max(free, 0)} slot${free === 1 ? " is" : "s are"} free on ${plan.name} (${plan.maxActiveSites} sites). Resume fewer websites or upgrade your plan.`,
          "plan_limit",
        );
      }
      await tx.site.updateMany({
        where: { id: { in: ids } },
        data: { status: "active", pausedAt: null, pausedById: null },
      });
      await resetMonitoringState(tx, ids);
      for (const id of ids) await recordAudit(tx, ctx, "site.resumed", "site", id);
    }
    return { changed: ids, skipped: siteIds.length - ids.length };
  });
}

/** Stops monitoring for good but keeps history (FR-SITE-09). */
export async function archiveSite(db: PrismaClient, ctx: TenantContext, siteId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.site.updateMany({
      where: { id: siteId, workspaceId: ctx.workspaceId, status: { not: "archived" } },
      data: { status: "archived", archivedAt: now, liveHostKey: null, pausedAt: null, pausedById: null },
    });
    if (count === 0) throw notFound("website");
    await recordAudit(tx, ctx, "site.archived", "site", siteId);
  });
}

/** Restores an archived site as active — a reactivation, so the plan limit applies. */
export async function restoreSite(db: PrismaClient, ctx: TenantContext, siteId: string) {
  try {
    await db.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx.workspaceId);
      const site = await tx.site.findFirst({
        where: { id: siteId, workspaceId: ctx.workspaceId, status: "archived" },
        select: { normalizedHostname: true, clientId: true, client: { select: { status: true } } },
      });
      if (!site) throw notFound("website");
      const plan = await planFor(tx, ctx.workspaceId);
      if ((await activeCount(tx, ctx.workspaceId)) >= plan.maxActiveSites)
        throw planLimitError(plan.name, plan.maxActiveSites);
      await tx.site.update({
        where: { id: siteId },
        data: {
          status: "active",
          archivedAt: null,
          liveHostKey: site.normalizedHostname,
          // Don't reattach to a client that has since been archived.
          clientId: site.client?.status === "active" ? site.clientId : null,
        },
      });
      await resetMonitoringState(tx, [siteId]);
      await recordAudit(tx, ctx, "site.restored", "site", siteId);
    });
  } catch (error) {
    if (isLiveHostConflict(error)) {
      throw new UserFacingError("Another website with this address is already monitored.", "duplicate");
    }
    throw error;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────

export const SITE_SORTS = ["status", "name", "client", "added"] as const;
export type SiteSort = (typeof SITE_SORTS)[number];
export type SiteStatusFilter = "all" | SiteStatus;

export type SiteQuery = {
  q?: string;
  clientId?: string | "unassigned";
  status?: SiteStatusFilter;
  sort?: SiteSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export const PAGE_SIZES = [25, 50, 100] as const;

const siteListSelect = {
  id: true,
  name: true,
  baseUrl: true,
  normalizedHostname: true,
  status: true,
  pausedAt: true,
  archivedAt: true,
  createdAt: true,
  client: { select: { id: true, name: true } },
  pausedBy: { select: { name: true } },
  state: {
    select: {
      liveStatus: true,
      statusDetail: true,
      statusSince: true,
      lastCheckAt: true,
      lastResponseMs: true,
      sslState: true,
      sslExpiresAt: true,
      sslDetail: true,
      sslCheckedAt: true,
      domainState: true,
      domainExpiresAt: true,
      domainDetail: true,
      lastAuditAt: true,
      lastAuditStatus: true,
      openFindings: true,
    },
  },
} satisfies Prisma.SiteSelect;

export type SiteListItem = Prisma.SiteGetPayload<{ select: typeof siteListSelect }>;

export async function listSites(db: PrismaClient, ctx: TenantContext, query: SiteQuery) {
  const q = query.q?.trim();
  const status = query.status ?? "all";
  const where: Prisma.SiteWhereInput = {
    workspaceId: ctx.workspaceId,
    status: status === "all" ? { not: "archived" } : status,
    ...(query.clientId === "unassigned" ? { clientId: null } : query.clientId ? { clientId: query.clientId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { normalizedHostname: { contains: q.toLowerCase() } },
            { client: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const dir = query.dir ?? "asc";
  const orderBy: Prisma.SiteOrderByWithRelationInput[] =
    query.sort === "name"
      ? [{ nameKey: dir }]
      : query.sort === "client"
        ? [{ client: { nameKey: dir } }, { nameKey: "asc" }]
        : query.sort === "added"
          ? [{ createdAt: dir }]
          : // "status": most urgent first (down, degraded, unknown, up), paused last, then by name.
            [{ status: dir }, { state: { statusRank: dir } }, { nameKey: "asc" }];

  const pageSize = PAGE_SIZES.includes(query.pageSize as (typeof PAGE_SIZES)[number]) ? query.pageSize! : 25;
  const total = await db.site.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  const items = await db.site.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: siteListSelect,
  });
  return { items, total, page, pageSize, pageCount };
}

export async function siteCounts(db: PrismaClient, ctx: TenantContext) {
  const rows = await db.site.groupBy({ by: ["status"], where: { workspaceId: ctx.workspaceId }, _count: true });
  const get = (s: SiteStatus) => rows.find((r) => r.status === s)?._count ?? 0;
  return { active: get("active"), paused: get("paused"), archived: get("archived") };
}

export async function getSite(db: PrismaClient, ctx: TenantContext, siteId: string) {
  const site = await db.site.findFirst({
    where: { id: siteId, workspaceId: ctx.workspaceId },
    select: {
      ...siteListSelect,
      registrableDomain: true,
      timeoutMs: true,
      downPolicy: true,
      client: { select: { id: true, name: true, status: true } },
      crawlConfig: true,
      alertsEnabled: true,
      state: true,
    },
  });
  if (!site) throw notFound("website");
  return site;
}

/** Live hostnames in the workspace, for import duplicate checks. */
export async function liveHostnames(db: PrismaClient | Tx, ctx: TenantContext): Promise<Set<string>> {
  const rows = await db.site.findMany({
    where: { workspaceId: ctx.workspaceId, liveHostKey: { not: null } },
    select: { liveHostKey: true },
  });
  return new Set(rows.map((r) => r.liveHostKey!));
}

export async function recentSiteActivity(db: PrismaClient, ctx: TenantContext, take = 8) {
  const log = await db.auditLog.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      OR: [{ resourceType: { in: ["site", "client"] } }, { action: "sites.imported" }],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });
  const siteIds = log.filter((l) => l.resourceType === "site").map((l) => l.resourceId);
  const clientIds = log.filter((l) => l.resourceType === "client").map((l) => l.resourceId);
  const [sites, clients] = await Promise.all([
    db.site.findMany({
      where: { id: { in: siteIds }, workspaceId: ctx.workspaceId },
      select: { id: true, normalizedHostname: true },
    }),
    db.client.findMany({
      where: { id: { in: clientIds }, workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
    }),
  ]);
  const label = new Map<string, string>([
    ...sites.map((s) => [s.id, s.normalizedHostname] as const),
    ...clients.map((c) => [c.id, c.name] as const),
  ]);
  return log.map(({ metadata, ...l }) => {
    if (l.action === "sites.imported") {
      const n = Number((metadata as { imported?: number } | null)?.imported ?? 0);
      return { ...l, label: `${n} website${n === 1 ? "" : "s"} from CSV` };
    }
    return { ...l, label: label.get(l.resourceId) ?? "(removed)" };
  });
}
