import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CrawlResult } from "@/lib/crawler/crawl";
import { findingKey, type FindingDraft } from "@/lib/crawler/findings";
import { findOpen, openIncident, resolveIncident, type SiteRef } from "@/lib/monitoring/apply";

// Stores an audit's outcome. Findings keep their identity across audits
// ("first found <date>"). Only a complete audit may resolve findings it didn't
// see — a partial one didn't look everywhere (spec §11: never imply more than
// the audit covered).

/** Broken internal links at or above this make the audit incident High instead of Medium. */
const HIGH_BROKEN_LINKS = 20;

export async function applyAuditResult(
  db: PrismaClient,
  site: SiteRef,
  runId: string,
  result: CrawlResult,
  pagesBudget: number,
  now = new Date(),
) {
  const drafts = new Map<string, FindingDraft>();
  for (const f of result.findings) drafts.set(findingKey(f), f);

  return db.$transaction(
    async (tx) => {
      const open = await tx.auditFinding.findMany({
        where: { siteId: site.id, resolvedAt: null },
        select: { id: true, key: true },
      });
      const openByKey = new Map(open.map((f) => [f.key, f.id]));

      const toCreate = [];
      for (const [key, f] of drafts) {
        const existing = openByKey.get(key);
        const data = {
          severity: f.severity,
          summary: f.summary.slice(0, 300),
          statusCode: f.statusCode,
          lastSeenAt: now,
          auditRunId: runId,
        };
        if (existing) await tx.auditFinding.update({ where: { id: existing }, data });
        else
          toCreate.push({
            ...data,
            workspaceId: site.workspaceId,
            siteId: site.id,
            key,
            type: f.type,
            sourceUrl: f.sourceUrl?.slice(0, 2000) ?? null,
            targetUrl: f.targetUrl?.slice(0, 2000) ?? null,
            firstSeenAt: now,
            openKey: `${site.id}:${key}`,
          });
      }
      if (toCreate.length) await tx.auditFinding.createMany({ data: toCreate });

      let resolved = 0;
      if (result.status === "completed") {
        const gone = open.filter((f) => !drafts.has(f.key)).map((f) => f.id);
        if (gone.length) {
          resolved = (
            await tx.auditFinding.updateMany({ where: { id: { in: gone } }, data: { resolvedAt: now, openKey: null } })
          ).count;
        }
      }

      // Confirmed broken internal links are worth an incident (FR-INC-01 "selected high-priority findings").
      const incident = await findOpen(tx, site.id, "audit_issue");
      const n = result.brokenInternal;
      if (n > 0) {
        const title = `${n} confirmed broken link${n === 1 ? "" : "s"}`;
        const summary = `${n} internal link${n === 1 ? "" : "s"} returned a stable error after a retry. ${result.pagesVisited} pages crawled of a ${pagesBudget}-page budget.${result.inconclusiveLinks ? ` ${result.inconclusiveLinks} links were inconclusive and not counted.` : ""}`;
        const severity = n >= HIGH_BROKEN_LINKS ? "high" : "medium";
        if (!incident)
          await openIncident(
            tx,
            site,
            { type: "audit_issue", severity, title, summary, detail: "Opened from audit findings" },
            now,
          );
        else
          await tx.incident.update({
            where: { id: incident.id },
            data: { title, summary, severity, lastDetectedAt: now },
          });
      } else if (incident && result.status === "completed") {
        await resolveIncident(tx, incident, "The latest complete audit found no broken internal links", now);
      }

      const openCount = await tx.auditFinding.count({ where: { siteId: site.id, resolvedAt: null } });
      await tx.auditRun.update({
        where: { id: runId },
        data: {
          status: result.status,
          completedAt: now,
          pagesVisited: result.pagesVisited,
          pagesBudget,
          linksChecked: result.linksChecked,
          inconclusiveLinks: result.inconclusiveLinks,
          skippedByRobots: result.skippedByRobots,
          requests: result.requests,
          findingsCount: drafts.size,
          robots: result.robots,
          partialReasons: result.partialReasons,
        },
      });
      await tx.siteState.update({
        where: { siteId: site.id },
        data: { lastAuditAt: now, lastAuditStatus: result.status, lastAuditRunId: runId, openFindings: openCount },
      });
      return { created: toCreate.length, resolved, open: openCount };
    },
    { timeout: 60_000 },
  );
}
