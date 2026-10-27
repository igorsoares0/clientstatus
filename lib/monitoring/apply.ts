import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { IncidentSeverity, IncidentType } from "@/lib/generated/prisma/enums";
import type { Tx } from "@/lib/data/workspace-tx";
import { notifyIncident } from "@/lib/notify/incidents";
import type { UptimeResult } from "@/lib/monitoring/classify";
import { decideUptime, expirySeverity, nextSweep, jitterFor, thresholdReached, plural } from "@/lib/monitoring/decide";
import type { DomainResult } from "@/lib/monitoring/rdap";
import type { SslResult } from "@/lib/monitoring/tls-check";

// Applies check results: history row, cached site state, and the incident
// lifecycle (FR-INC-01..06). One transaction per result.

export type SiteRef = { id: string; workspaceId: string; intervalMs: number };

const SSL_SWEEP_HOURS = 6;
const DOMAIN_SWEEP_HOURS = 24;
const DOMAIN_SWEEP_OFFSET_HOURS = 2; // 02:00 UTC, as in the design
const INCONCLUSIVE_RETRY_MS = 60 * 60_000;

async function ensureState(tx: Tx, site: SiteRef) {
  return tx.siteState.upsert({
    where: { siteId: site.id },
    create: { siteId: site.id, workspaceId: site.workspaceId },
    update: {},
  });
}

function openKey(siteId: string, type: IncidentType) {
  return `${siteId}:${type}`;
}

export async function findOpen(tx: Tx, siteId: string, type: IncidentType) {
  return tx.incident.findUnique({ where: { openKey: openKey(siteId, type) } });
}

export async function openIncident(
  tx: Tx,
  site: SiteRef,
  input: { type: IncidentType; severity: IncidentSeverity; title: string; summary: string; detail: string },
  now: Date,
) {
  const ws = await tx.workspace.update({
    where: { id: site.workspaceId },
    data: { incidentSeq: { increment: 1 } },
    select: { incidentSeq: true },
  });
  const incident = await tx.incident.create({
    data: {
      workspaceId: site.workspaceId,
      siteId: site.id,
      number: ws.incidentSeq,
      type: input.type,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      firstDetectedAt: now,
      lastDetectedAt: now,
      openKey: openKey(site.id, input.type),
    },
  });
  await tx.incidentEvent.create({
    data: {
      workspaceId: site.workspaceId,
      incidentId: incident.id,
      eventType: "opened",
      detail: input.detail,
      createdAt: now,
    },
  });
  await notifyIncident(tx, incident.id, "opened", now);
  return incident;
}

export async function resolveIncident(
  tx: Tx,
  incident: { id: string; workspaceId: string },
  detail: string,
  now: Date,
) {
  await tx.incident.update({
    where: { id: incident.id },
    data: { status: "resolved", resolvedAt: now, lastDetectedAt: now, openKey: null },
  });
  await tx.incidentEvent.create({
    data: { workspaceId: incident.workspaceId, incidentId: incident.id, eventType: "resolved", detail, createdAt: now },
  });
  await notifyIncident(tx, incident.id, "resolved", now);
}

/** Keeps an expiry incident open with the right threshold, or opens one. */
async function upsertExpiryIncident(
  tx: Tx,
  site: SiteRef,
  type: "ssl_expiry" | "domain_expiry",
  daysLeft: number,
  summary: string,
  now: Date,
) {
  const severity = expirySeverity(daysLeft);
  const what = type === "ssl_expiry" ? "SSL certificate" : "Domain registration";
  const title = daysLeft <= 0 ? `${what} expires today` : `${what} expires in ${plural(daysLeft, "day")}`;
  const threshold = thresholdReached(daysLeft);
  const existing = await findOpen(tx, site.id, type);
  if (!existing) {
    await openIncident(
      tx,
      site,
      { type, severity, title, summary, detail: `Opened — ${threshold}-day threshold` },
      now,
    );
    return;
  }
  await tx.incident.update({ where: { id: existing.id }, data: { title, summary, severity, lastDetectedAt: now } });
  if (existing.severity !== severity) {
    await tx.incidentEvent.create({
      data: {
        workspaceId: site.workspaceId,
        incidentId: existing.id,
        eventType: "severity_changed",
        detail: `${threshold}-day threshold reached`,
        createdAt: now,
      },
    });
    // One email per threshold crossed (30, 14, 7, 1 days).
    await notifyIncident(tx, existing.id, "threshold", now, String(threshold));
  }
}

/**
 * Next regular check on the site's own fixed slot: every site gets a stable
 * phase within its interval (from its id), so checks are spread evenly instead
 * of bunching, and queueing or response time never stretches the interval. A
 * check that ran late skips to the following slot rather than running twice in
 * quick succession.
 */
export function nextRegularCheck(siteId: string, intervalMs: number, now: Date): Date {
  const phase = jitterFor(siteId, intervalMs);
  const sinceSlot = (((now.getTime() - phase) % intervalMs) + intervalMs) % intervalMs;
  let next = now.getTime() - sinceSlot + intervalMs;
  if (next - now.getTime() < intervalMs / 2) next += intervalMs;
  return new Date(next);
}

export async function recordUptime(db: PrismaClient, site: SiteRef, result: UptimeResult, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.monitorCheck.create({
      data: {
        workspaceId: site.workspaceId,
        siteId: site.id,
        checkType: "uptime",
        status: result.status,
        checkedAt: now,
        durationMs: result.durationMs,
        httpStatusCode: result.httpStatus,
        failureCategory: result.category,
        summary: result.summary,
      },
    });
    const state = await ensureState(tx, site);
    const open = await findOpen(tx, site.id, "downtime");
    const decision = decideUptime(state, result, Boolean(open));

    if (decision.openIncident) {
      const headline = result.summary.split(" · ")[0];
      await openIncident(
        tx,
        site,
        {
          type: "downtime",
          severity: "critical",
          title: `Website down — ${headline.replace(/^Connection/, "connection").replace(/^Domain/, "domain")}`,
          summary: result.summary,
          detail: `Opened after ${decision.next.consecutiveFailures} consecutive failed checks`,
        },
        now,
      );
    } else if (open && result.status === "failure") {
      await tx.incident.update({ where: { id: open.id }, data: { lastDetectedAt: now, summary: result.summary } });
    }
    if (decision.resolveIncident && open) {
      await resolveIncident(
        tx,
        open,
        `Resolved automatically after ${decision.next.consecutiveSuccesses} consecutive passing checks`,
        now,
      );
    }

    const changed = decision.next.liveStatus !== state.liveStatus;
    const statusRank = { down: 0, degraded: 1, unknown: 2, up: 3 }[decision.next.liveStatus];
    return tx.siteState.update({
      where: { siteId: site.id },
      data: {
        ...decision.next,
        statusRank,
        statusSince: changed || !state.statusSince ? now : state.statusSince,
        lastCheckAt: now,
        ...(result.durationMs !== null && result.status !== "inconclusive"
          ? { lastResponseMs: result.durationMs }
          : {}),
        ...(result.httpStatus !== null ? { lastHttpStatus: result.httpStatus } : {}),
        nextCheckAt:
          decision.nextDelayMs !== null
            ? new Date(now.getTime() + decision.nextDelayMs)
            : nextRegularCheck(site.id, site.intervalMs, now),
      },
    });
  });
}

export function nextSslCheck(siteId: string, now: Date) {
  return nextSweep(now, SSL_SWEEP_HOURS, 0, jitterFor(siteId, 10 * 60_000));
}

/** Next scheduled audit: around 03:00 UTC, `everyDays` after today. */
export function nextAudit(siteId: string, now: Date, everyDays: number) {
  const first = nextSweep(now, 24, 3, jitterFor(siteId, 60 * 60_000));
  return new Date(first.getTime() + (everyDays - 1) * 24 * 60 * 60_000);
}

export function nextDomainCheck(siteId: string, now: Date) {
  return nextSweep(now, DOMAIN_SWEEP_HOURS, DOMAIN_SWEEP_OFFSET_HOURS, jitterFor(siteId, 30 * 60_000));
}

/** http-only sites have no certificate: record "none" and resolve any SSL incidents. */
export async function recordNoSsl(db: PrismaClient, site: SiteRef, now = new Date()) {
  await db.$transaction(async (tx) => {
    await ensureState(tx, site);
    for (const type of ["ssl_invalid", "ssl_expiry"] as const) {
      const open = await findOpen(tx, site.id, type);
      if (open) await resolveIncident(tx, open, "Site is now checked over http only", now);
    }
    await tx.siteState.update({
      where: { siteId: site.id },
      data: {
        sslState: "none",
        sslExpiresAt: null,
        sslIssuer: null,
        sslDetail: "http only — no SSL check",
        sslCheckedAt: now,
        nextSslCheckAt: nextSslCheck(site.id, now),
      },
    });
  });
}

export async function recordSsl(db: PrismaClient, site: SiteRef, result: SslResult, now = new Date()) {
  await db.$transaction(async (tx) => {
    await tx.monitorCheck.create({
      data: {
        workspaceId: site.workspaceId,
        siteId: site.id,
        checkType: "ssl",
        status: result.status,
        checkedAt: now,
        failureCategory: result.category,
        summary: result.summary,
        metadata: result.expiresAt ? { expiresAt: result.expiresAt.toISOString(), issuer: result.issuer } : undefined,
      },
    });
    await ensureState(tx, site);

    if (result.status === "inconclusive") {
      // Keep the last known certificate state; try again sooner.
      await tx.siteState.update({
        where: { siteId: site.id },
        data: { nextSslCheckAt: new Date(now.getTime() + INCONCLUSIVE_RETRY_MS) },
      });
      return;
    }

    const invalid = await findOpen(tx, site.id, "ssl_invalid");
    const expiry = await findOpen(tx, site.id, "ssl_expiry");
    if (result.status === "failure") {
      const severity: IncidentSeverity = result.state === "expired" ? "critical" : "high";
      if (!invalid) {
        await openIncident(
          tx,
          site,
          {
            type: "ssl_invalid",
            severity,
            title: result.summary,
            summary: result.summary,
            detail: `Opened — ${result.summary.toLowerCase()}`,
          },
          now,
        );
      } else {
        await tx.incident.update({
          where: { id: invalid.id },
          data: { lastDetectedAt: now, title: result.summary, summary: result.summary, severity },
        });
      }
      if (result.state === "expired" && expiry)
        await resolveIncident(tx, expiry, "Superseded — the certificate has expired", now);
    } else {
      if (invalid) await resolveIncident(tx, invalid, `Valid certificate detected — ${result.summary}`, now);
      if (result.state === "expiring" && result.daysLeft !== null) {
        await upsertExpiryIncident(tx, site, "ssl_expiry", result.daysLeft, result.summary, now);
      } else if (expiry) {
        await resolveIncident(tx, expiry, `Renewed certificate detected — ${result.summary}`, now);
      }
    }

    await tx.siteState.update({
      where: { siteId: site.id },
      data: {
        sslState: result.state,
        sslExpiresAt: result.expiresAt,
        sslIssuer: result.issuer,
        sslDetail: result.summary,
        sslCheckedAt: now,
        nextSslCheckAt: nextSslCheck(site.id, now),
      },
    });
  });
}

export async function recordDomain(db: PrismaClient, site: SiteRef, result: DomainResult, now = new Date()) {
  await db.$transaction(async (tx) => {
    await tx.monitorCheck.create({
      data: {
        workspaceId: site.workspaceId,
        siteId: site.id,
        checkType: "domain",
        status: result.status,
        checkedAt: now,
        summary: result.summary,
        metadata: result.expiresAt ? { expiresAt: result.expiresAt.toISOString(), source: result.source } : undefined,
      },
    });
    await ensureState(tx, site);
    if (result.status === "inconclusive") {
      await tx.siteState.update({
        where: { siteId: site.id },
        data: { domainDetail: result.summary, nextDomainCheckAt: new Date(now.getTime() + 6 * INCONCLUSIVE_RETRY_MS) },
      });
      return;
    }
    const open = await findOpen(tx, site.id, "domain_expiry");
    if (result.state === "expiring" && result.daysLeft !== null) {
      await upsertExpiryIncident(tx, site, "domain_expiry", result.daysLeft, result.summary, now);
    } else if (result.state === "ok" && open) {
      await resolveIncident(tx, open, `Renewal detected — ${result.summary}`, now);
    }
    await tx.siteState.update({
      where: { siteId: site.id },
      data: {
        domainState: result.state,
        domainExpiresAt: result.expiresAt,
        domainSource: result.source,
        domainDetail: result.summary,
        domainCheckedAt: now,
        nextDomainCheckAt: nextDomainCheck(site.id, now),
      },
    });
  });
}
