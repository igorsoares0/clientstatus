import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { notFound, UserFacingError } from "@/lib/data/errors";
import { assertRole, type TenantContext } from "@/lib/data/tenant";
import { recordAudit, type Tx } from "@/lib/data/workspace-tx";

// Clients (FR-CLIENT-01..05). Managing clients needs Admin or Owner (Team
// permission matrix: "Manage clients"); viewing is open to every member.

/** Display form: trimmed, inner whitespace collapsed. */
export function cleanClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function clientNameKey(name: string): string {
  return cleanClientName(name).toLowerCase();
}

export type ClientInput = { name: string; contactName?: string | null; contactEmail?: string | null };

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createClient(db: PrismaClient, ctx: TenantContext, input: ClientInput) {
  assertRole(ctx, "admin");
  const name = cleanClientName(input.name);
  try {
    return await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          workspaceId: ctx.workspaceId,
          name,
          nameKey: clientNameKey(name),
          contactName: input.contactName || null,
          contactEmail: input.contactEmail || null,
        },
        select: { id: true, name: true },
      });
      await recordAudit(tx, ctx, "client.created", "client", client.id);
      return client;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(`${name} already exists.`, "duplicate", "name");
    throw error;
  }
}

/** Finds an active client by name, or creates one (Admin+). Used by quick-add flows. */
export async function findOrCreateClientByName(tx: Tx, ctx: TenantContext, name: string) {
  const key = clientNameKey(name);
  const existing = await tx.client.findUnique({
    where: { workspaceId_nameKey: { workspaceId: ctx.workspaceId, nameKey: key } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "archived") {
      throw new UserFacingError(
        `${cleanClientName(name)} is archived. Restore it first or choose another client.`,
        "invalid",
        "client",
      );
    }
    return existing.id;
  }
  assertRole(ctx, "admin");
  const created = await tx.client.create({
    data: { workspaceId: ctx.workspaceId, name: cleanClientName(name), nameKey: key },
    select: { id: true },
  });
  await recordAudit(tx, ctx, "client.created", "client", created.id);
  return created.id;
}

export async function updateClient(db: PrismaClient, ctx: TenantContext, clientId: string, input: ClientInput) {
  assertRole(ctx, "admin");
  const name = cleanClientName(input.name);
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.client.updateMany({
        where: { id: clientId, workspaceId: ctx.workspaceId },
        data: {
          name,
          nameKey: clientNameKey(name),
          contactName: input.contactName || null,
          contactEmail: input.contactEmail || null,
        },
      });
      if (count === 0) throw notFound("client");
      await recordAudit(tx, ctx, "client.updated", "client", clientId);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError(`${name} already exists.`, "duplicate", "name");
    throw error;
  }
}

export async function updateClientNotes(db: PrismaClient, ctx: TenantContext, clientId: string, notes: string) {
  assertRole(ctx, "admin");
  await db.$transaction(async (tx) => {
    const { count } = await tx.client.updateMany({
      where: { id: clientId, workspaceId: ctx.workspaceId },
      data: { notes: notes.trim() || null },
    });
    if (count === 0) throw notFound("client");
    await recordAudit(tx, ctx, "client.notes_updated", "client", clientId);
  });
}

export type ArchiveMode = "unassign" | "pause";

/** Archives a client; its websites become Unassigned or are paused. History is kept (FR-CLIENT-05). */
export async function archiveClient(
  db: PrismaClient,
  ctx: TenantContext,
  clientId: string,
  mode: ArchiveMode,
  now = new Date(),
) {
  assertRole(ctx, "admin");
  await db.$transaction(async (tx) => {
    const { count } = await tx.client.updateMany({
      where: { id: clientId, workspaceId: ctx.workspaceId, status: "active" },
      data: { status: "archived", archivedAt: now },
    });
    if (count === 0) throw notFound("client");
    if (mode === "pause") {
      await tx.site.updateMany({
        where: { workspaceId: ctx.workspaceId, clientId, status: "active" },
        data: { status: "paused", pausedAt: now, pausedById: ctx.userId },
      });
    } else {
      await tx.site.updateMany({
        where: { workspaceId: ctx.workspaceId, clientId, status: { not: "archived" } },
        data: { clientId: null },
      });
    }
    await recordAudit(tx, ctx, "client.archived", "client", clientId, { sites: mode });
  });
}

export async function restoreClient(db: PrismaClient, ctx: TenantContext, clientId: string) {
  assertRole(ctx, "admin");
  await db.$transaction(async (tx) => {
    const { count } = await tx.client.updateMany({
      where: { id: clientId, workspaceId: ctx.workspaceId, status: "archived" },
      data: { status: "active", archivedAt: null },
    });
    if (count === 0) throw notFound("client");
    await recordAudit(tx, ctx, "client.restored", "client", clientId);
  });
}

export type ClientTab = "active" | "archived";

export async function listClients(db: PrismaClient, ctx: TenantContext, opts: { tab: ClientTab; q?: string }) {
  const q = opts.q?.trim();
  const where: Prisma.ClientWhereInput = {
    workspaceId: ctx.workspaceId,
    status: opts.tab,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { contactEmail: { contains: q, mode: "insensitive" } },
            { sites: { some: { normalizedHostname: { contains: q.toLowerCase() }, status: { not: "archived" } } } },
          ],
        }
      : {}),
  };
  const clients = await db.client.findMany({
    where,
    orderBy: { nameKey: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      archivedAt: true,
      createdAt: true,
      sites: { where: { status: { not: "archived" } }, select: { status: true } },
    },
  });
  return clients.map(({ sites, ...c }) => ({
    ...c,
    activeSites: sites.filter((s) => s.status === "active").length,
    pausedSites: sites.filter((s) => s.status === "paused").length,
  }));
}

export async function countClients(db: PrismaClient, ctx: TenantContext) {
  const rows = await db.client.groupBy({ by: ["status"], where: { workspaceId: ctx.workspaceId }, _count: true });
  const get = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { active: get("active"), archived: get("archived") };
}

export async function getClient(db: PrismaClient, ctx: TenantContext, clientId: string) {
  const client = await db.client.findFirst({
    where: { id: clientId, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      notes: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      sites: {
        where: { status: { not: "archived" } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          baseUrl: true,
          normalizedHostname: true,
          status: true,
          pausedAt: true,
          state: {
            select: {
              liveStatus: true,
              statusDetail: true,
              statusSince: true,
              lastCheckAt: true,
              sslState: true,
              sslExpiresAt: true,
              sslDetail: true,
              sslCheckedAt: true,
            },
          },
        },
      },
    },
  });
  if (!client) throw notFound("client");
  return client;
}

/** Active clients for select menus. */
export async function listClientOptions(db: PrismaClient, ctx: TenantContext) {
  return db.client.findMany({
    where: { workspaceId: ctx.workspaceId, status: "active" },
    orderBy: { nameKey: "asc" },
    select: { id: true, name: true },
  });
}
