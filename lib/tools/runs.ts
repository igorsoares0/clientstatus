import type { PrismaClient } from "@/lib/generated/prisma/client";
import { enqueue } from "@/lib/jobs/queue";
import type { ToolSlug } from "@/lib/tools/limits";

// Long-running tool runs (broken-link check, health report): queued for the worker, polled by
// the page through GET /api/tools/runs/<id>. Tool jobs run after customer work (lower priority)
// and are refused while too many are waiting, so free traffic can't delay paying customers.
// The worker side (lib/tools/jobs.ts) is separate so web routes never load Chromium.

export const TOOL_JOB = {
  "broken-link-checker": "tool_broken_links",
  "website-health-report": "tool_health_report",
} as const satisfies Partial<Record<ToolSlug, string>>;
export type QueuedTool = keyof typeof TOOL_JOB;
export const TOOL_JOB_TYPES: string[] = Object.values(TOOL_JOB);

/** Below customer jobs (priority 0) in the long-job lane. */
const TOOL_PRIORITY = -10;
/** Refuse new runs when this many are already waiting or running. */
export const MAX_ACTIVE_RUNS = 20;

export class ToolsBusyError extends Error {}

type Db = Pick<PrismaClient, "toolRun" | "toolLead" | "job" | "$transaction">;

export async function startToolRun(
  db: Db,
  tool: QueuedTool,
  url: string,
  lead?: { email: string; consent: string; marketingOptIn: boolean },
): Promise<{ runId: string }> {
  const active = await db.toolRun.count({ where: { status: { in: ["queued", "running"] } } });
  if (active >= MAX_ACTIVE_RUNS) throw new ToolsBusyError();
  return db.$transaction(async (tx) => {
    const run = await tx.toolRun.create({ data: { tool, url } });
    if (lead) await tx.toolLead.create({ data: { ...lead, url, tool, toolRunId: run.id } });
    await enqueue(tx, [
      {
        jobType: TOOL_JOB[tool],
        resourceType: "tool_run",
        resourceId: run.id,
        priority: TOOL_PRIORITY,
        maxAttempts: 1,
      },
    ]);
    return { runId: run.id };
  });
}

export type PublicRun = {
  status: "queued" | "running" | "completed" | "failed";
  tool: string;
  url: string;
  result: unknown;
  error: string | null;
};

/** What the page may see: never the lead's email. */
export async function getToolRun(db: Pick<PrismaClient, "toolRun">, id: string): Promise<PublicRun | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const run = await db.toolRun.findUnique({
    where: { id },
    select: { status: true, tool: true, url: true, result: true, error: true },
  });
  return run ? { ...run, result: run.result ?? null } : null;
}
