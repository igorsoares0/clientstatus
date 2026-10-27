import type { PrismaClient } from "@/lib/generated/prisma/client";

/** Worker writes its heartbeat this often. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Silence longer than this means results may be delayed (4 missed beats). */
export const HEARTBEAT_STALE_MS = 60_000;

export type WorkerState =
  { kind: "running"; lastSeenAt: Date } | { kind: "delayed"; lastSeenAt: Date } | { kind: "never-started" };

export function classifyWorker(lastSeenAt: Date | null, now: Date): WorkerState {
  if (!lastSeenAt) return { kind: "never-started" };
  return now.getTime() - lastSeenAt.getTime() > HEARTBEAT_STALE_MS
    ? { kind: "delayed", lastSeenAt }
    : { kind: "running", lastSeenAt };
}

export async function getWorkerState(db: PrismaClient, now = new Date()): Promise<WorkerState> {
  const latest = await db.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } });
  return classifyWorker(latest?.lastSeenAt ?? null, now);
}
