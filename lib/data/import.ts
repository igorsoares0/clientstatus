import { assertCanOperate } from "@/lib/billing/access";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { clientNameKey } from "@/lib/data/clients";
import { siteNameKey } from "@/lib/data/sites";
import { UserFacingError } from "@/lib/data/errors";
import type { TenantContext } from "@/lib/data/tenant";
import { lockWorkspace, recordAudit, type Tx } from "@/lib/data/workspace-tx";
import type { ImportRow } from "@/lib/csv";
import { getPlan } from "@/lib/plans";
import { normalizeSiteUrl, type NormalizedUrl } from "@/lib/url";

// CSV import (FR-SITE-06): every row is validated and shown before anything is
// added. The commit re-evaluates on the server under the workspace lock, so the
// preview can't be used to bypass duplicates or the plan limit.

export type EvaluatedRow = ImportRow & {
  kind: "ok" | "warn" | "err";
  message: string;
  hostname?: string;
};

type Ready = EvaluatedRow & { kind: "ok" | "warn"; normalized: NormalizedUrl; clientId: string | null };

const MAX_IMPORTS_PER_HOUR = 20;

async function evaluate(tx: Tx, ctx: TenantContext, rows: ImportRow[]): Promise<(EvaluatedRow | Ready)[]> {
  const [ws, live, clients, active] = await Promise.all([
    tx.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: { planKey: true } }),
    tx.site.findMany({
      where: { workspaceId: ctx.workspaceId, liveHostKey: { not: null } },
      select: { liveHostKey: true },
    }),
    tx.client.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, nameKey: true, status: true } }),
    tx.site.count({ where: { workspaceId: ctx.workspaceId, status: "active" } }),
  ]);
  const plan = getPlan(ws.planKey);
  const existing = new Set(live.map((s) => s.liveHostKey!));
  const byKey = new Map(clients.map((c) => [c.nameKey, c]));
  const seen = new Map<string, number>();
  let free = plan.maxActiveSites - active;

  return rows.map((row) => {
    const result = normalizeSiteUrl(row.url);
    if (!result.ok) return { ...row, kind: "err", message: result.error };
    const { value } = result;
    const hostname = value.hostname;
    if (existing.has(hostname)) return { ...row, hostname, kind: "err", message: "Already monitored" };
    const dupOf = seen.get(hostname);
    if (dupOf) return { ...row, hostname, kind: "err", message: `Duplicate of row ${dupOf}` };
    seen.set(hostname, row.line);
    if (free <= 0) {
      return {
        ...row,
        hostname,
        kind: "err",
        message: `Over plan limit — ${plan.maxActiveSites} sites on ${plan.name}`,
      };
    }
    free--;

    const ready = { ...row, hostname, normalized: value };
    const okMessage = value.https ? "Ready" : "Ready · http only, no SSL check";
    if (!row.client) return { ...ready, kind: "ok", message: okMessage, clientId: null };
    const client = byKey.get(clientNameKey(row.client));
    if (!client)
      return {
        ...ready,
        kind: "warn",
        message: `Ready · client “${row.client}” not found → Unassigned`,
        clientId: null,
      };
    if (client.status === "archived") {
      return {
        ...ready,
        kind: "warn",
        message: `Ready · client “${row.client}” is archived → Unassigned`,
        clientId: null,
      };
    }
    return { ...ready, kind: "ok", message: okMessage, clientId: client.id };
  });
}

function strip(rows: (EvaluatedRow | Ready)[]): EvaluatedRow[] {
  return rows.map((r) => ({
    line: r.line,
    url: r.url,
    name: r.name,
    client: r.client,
    kind: r.kind,
    message: r.message,
    hostname: r.hostname,
  }));
}

export async function previewImport(db: PrismaClient, ctx: TenantContext, rows: ImportRow[]): Promise<EvaluatedRow[]> {
  return strip(await evaluate(db, ctx, rows));
}

export async function commitImport(db: PrismaClient, ctx: TenantContext, rows: ImportRow[], now = new Date()) {
  await assertCanOperate(db, ctx, now);
  const recent = await db.auditLog.count({
    where: {
      workspaceId: ctx.workspaceId,
      action: "sites.imported",
      createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });
  if (recent >= MAX_IMPORTS_PER_HOUR) {
    throw new UserFacingError("Too many imports in the last hour. Try again later.", "rate_limited");
  }

  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, ctx.workspaceId);
    const evaluated = await evaluate(tx, ctx, rows);
    const ready = evaluated.filter((r): r is Ready => r.kind !== "err");
    if (ready.length) {
      const created = await tx.site.createManyAndReturn({
        select: { id: true },
        data: ready.map((r) => ({
          workspaceId: ctx.workspaceId,
          clientId: r.clientId,
          name: r.name || r.normalized.hostname,
          nameKey: siteNameKey(r.name || r.normalized.hostname),
          baseUrl: r.normalized.baseUrl,
          normalizedHostname: r.normalized.hostname,
          registrableDomain: r.normalized.registrableDomain,
          liveHostKey: r.normalized.hostname,
        })),
      });
      await tx.siteState.createMany({ data: created.map((s) => ({ siteId: s.id, workspaceId: ctx.workspaceId })) });
    }
    await recordAudit(tx, ctx, "sites.imported", "workspace", ctx.workspaceId, {
      imported: ready.length,
      skipped: evaluated.length - ready.length,
    });
    return { imported: ready.length, rows: strip(evaluated) };
  });
}
