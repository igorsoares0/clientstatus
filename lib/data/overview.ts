import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { IncidentSeverity } from "@/lib/generated/prisma/enums";
import type { TenantContext } from "@/lib/data/tenant";
import { expirySeverity } from "@/lib/monitoring/decide";
import { isStale } from "@/lib/site-status";

// Overview: "which client sites need attention now" (design screen 1).
// Ranking: down → SSL invalid → degraded / expiring → stale.

export type AttentionItem = {
  key: string;
  rank: number;
  severity: IncidentSeverity;
  title: string;
  siteId: string;
  siteName: string;
  hostname: string;
  client: string | null;
  /** When it started, for "since 09:41"; null for date-based items. */
  since: Date | null;
  /** Date-based context, e.g. an expiry date. */
  dueAt: Date | null;
  incidentId: string | null;
};

export type Distribution = { up: number; degraded: number; down: number; unknown: number; paused: number };

const DAY = 86_400_000;

export async function portfolio(db: PrismaClient, ctx: TenantContext, intervalMs: number, now = new Date()) {
  const [sites, openIncidents, failures24h] = await Promise.all([
    db.site.findMany({
      where: { workspaceId: ctx.workspaceId, status: { in: ["active", "paused"] } },
      select: {
        id: true,
        name: true,
        normalizedHostname: true,
        status: true,
        baseUrl: true,
        client: { select: { name: true } },
        state: {
          select: {
            liveStatus: true,
            statusDetail: true,
            statusSince: true,
            lastCheckAt: true,
            sslState: true,
            sslExpiresAt: true,
            sslDetail: true,
            domainState: true,
            domainExpiresAt: true,
          },
        },
      },
    }),
    db.incident.findMany({
      where: { workspaceId: ctx.workspaceId, status: { not: "resolved" } },
      select: { id: true, siteId: true, type: true, status: true },
    }),
    db.monitorCheck.groupBy({
      by: ["siteId"],
      where: {
        workspaceId: ctx.workspaceId,
        checkType: "uptime",
        status: "failure",
        checkedAt: { gte: new Date(now.getTime() - DAY) },
      },
      _count: true,
    }),
  ]);

  const incidentFor = (siteId: string, type: string) =>
    openIncidents.find((i) => i.siteId === siteId && i.type === type)?.id ?? null;
  const failedRecently = new Set(failures24h.map((f) => f.siteId));
  const dist: Distribution = { up: 0, degraded: 0, down: 0, unknown: 0, paused: 0 };
  const items: AttentionItem[] = [];
  let awaiting = 0;
  let quiet = 0;
  let expiring30 = 0;
  let expiring7 = 0;

  for (const s of sites) {
    const base = { siteId: s.id, siteName: s.name, hostname: s.normalizedHostname, client: s.client?.name ?? null };
    if (s.status === "paused") {
      dist.paused++;
      continue;
    }
    const st = s.state;
    if (!st?.lastCheckAt) {
      dist.unknown++;
      awaiting++;
      continue;
    }
    const stale = isStale(st.lastCheckAt, intervalMs, now);
    if (stale) dist.unknown++;
    else dist[st.liveStatus]++;
    let flagged = false;

    if (!stale && st.liveStatus === "down") {
      items.push({
        ...base,
        key: `${s.id}:down`,
        rank: 0,
        severity: "critical",
        title: `Website down — ${st.statusDetail?.split(" · ")[0] ?? "failing checks"}`,
        since: st.statusSince,
        dueAt: null,
        incidentId: incidentFor(s.id, "downtime"),
      });
      flagged = true;
    }
    if (st.sslState === "invalid" || st.sslState === "expired") {
      items.push({
        ...base,
        key: `${s.id}:ssl`,
        rank: 1,
        severity: st.sslState === "expired" ? "critical" : "high",
        title: st.sslDetail ?? "SSL certificate invalid",
        since: null,
        dueAt: null,
        incidentId: incidentFor(s.id, "ssl_invalid"),
      });
      flagged = true;
    }
    if (!stale && st.liveStatus === "degraded") {
      items.push({
        ...base,
        key: `${s.id}:degraded`,
        rank: 2,
        severity: "medium",
        title: st.statusDetail ?? "Degraded",
        since: st.statusSince,
        dueAt: null,
        incidentId: null,
      });
      flagged = true;
    }
    for (const [kind, expires, label, type] of [
      ["ssl", st.sslState === "expiring" ? st.sslExpiresAt : null, "SSL certificate", "ssl_expiry"],
      ["domain", st.domainState === "expiring" ? st.domainExpiresAt : null, "Domain registration", "domain_expiry"],
    ] as const) {
      if (!expires) continue;
      const days = Math.floor((expires.getTime() - now.getTime()) / DAY);
      expiring30++;
      if (days <= 7) expiring7++;
      items.push({
        ...base,
        key: `${s.id}:${kind}-expiry`,
        rank: 2,
        severity: expirySeverity(days),
        title: days <= 0 ? `${label} expires today` : `${label} expires in ${days} day${days === 1 ? "" : "s"}`,
        since: null,
        dueAt: expires,
        incidentId: incidentFor(s.id, type),
      });
      flagged = true;
    }
    if (stale) {
      items.push({
        ...base,
        key: `${s.id}:stale`,
        rank: 3,
        severity: "low",
        title: "No recent results — showing last known status",
        since: st.lastCheckAt,
        dueAt: null,
        incidentId: null,
      });
      flagged = true;
    }
    if (!flagged && st.liveStatus === "up" && !failedRecently.has(s.id)) quiet++;
  }

  const sevOrder: Record<IncidentSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort(
    (a, b) =>
      a.rank - b.rank ||
      sevOrder[a.severity] - sevOrder[b.severity] ||
      (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0),
  );
  const atRisk = new Set(items.map((i) => i.siteId)).size;

  return {
    dist,
    items,
    atRisk,
    awaiting,
    quiet,
    expiring30,
    expiring7,
    activeIncidents: openIncidents.length,
    unacknowledged: openIncidents.filter((i) => i.status === "open").length,
    total: sites.length,
  };
}

/** Latest incident openings and resolutions, for the activity feed. */
export async function recentIncidentEvents(db: PrismaClient, ctx: TenantContext, take = 8) {
  return db.incidentEvent.findMany({
    where: { workspaceId: ctx.workspaceId, eventType: { in: ["opened", "resolved"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      incident: { select: { id: true, number: true, title: true, site: { select: { normalizedHostname: true } } } },
    },
  });
}
