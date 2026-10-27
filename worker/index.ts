// Background worker process (spec §6.1): runs separately from the web app.
// Schedules due checks, claims jobs from the Postgres queue and runs them.

import { createServer } from "node:http";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "@/lib/db";
import { env } from "@/lib/env";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS } from "@/lib/heartbeat";
import { queueMetrics } from "@/lib/jobs/queue";
import { createRunner } from "@/lib/jobs/runner";
import { logger } from "@/lib/log";
import { opsMetrics } from "@/lib/ops/metrics";
import { closePdfBrowser } from "@/lib/reports/pdf";

const log = logger("worker");
const config = env();
// Checks mostly wait on the network; 32 slots ≈ 30 checks/s on one worker (docs/load-test.md).
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 32;
// Crawls are paced (~1 request/s per host), so they mostly wait; see docs/load-test.md for sizing.
const AUDIT_CONCURRENCY = Number(process.env.WORKER_AUDIT_CONCURRENCY) || 4;
// Every running check holds a connection for its transaction; leave a few for scheduling and claims.
const db = createPrismaClient(undefined, CONCURRENCY + AUDIT_CONCURRENCY + 4);
const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
const startedAt = new Date();
const SCHEDULE_EVERY_MS = 5_000;
const CLAIM_EVERY_MS = 1_000;
let lastBeatAt: Date | null = null;
let stopping = false;

const runner = createRunner(db, {
  workerId,
  concurrency: CONCURRENCY,
  auditConcurrency: AUDIT_CONCURRENCY,
  refill: true,
  deps: { now: () => new Date() },
});

async function beat() {
  const now = new Date();
  try {
    await db.workerHeartbeat.upsert({
      where: { workerId },
      create: { workerId, startedAt, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    lastBeatAt = now;
  } catch (error) {
    log.error("heartbeat failed", { workerId, error });
  }
}

async function pruneOldHeartbeats() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: cutoff } } }).catch((error) => {
    log.warn("heartbeat prune failed", { error });
  });
}

/** Runs `fn` every `ms`, never overlapping itself, until stopping. */
function every(ms: number, name: string, fn: () => Promise<unknown>) {
  let running = false;
  const timer = setInterval(async () => {
    if (running || stopping) return;
    running = true;
    try {
      await fn();
    } catch (error) {
      log.error(`${name} failed`, { error });
    } finally {
      running = false;
    }
  }, ms);
  return timer;
}

const server = createServer(async (req, res) => {
  // Internal port only (never exposed publicly): full operational metrics as JSON.
  if (req.url === "/metrics") {
    try {
      const metrics = await opsMetrics(db);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ workerId, inFlight: runner.inFlight, ...metrics }));
    } catch (error) {
      log.error("metrics failed", { error });
      res.writeHead(503).end();
    }
    return;
  }
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  let database = "ok";
  let queue: Awaited<ReturnType<typeof queueMetrics>> | null = null;
  try {
    queue = await queueMetrics(db);
  } catch {
    database = "unreachable";
  }
  const beating = lastBeatAt !== null && Date.now() - lastBeatAt.getTime() <= HEARTBEAT_STALE_MS;
  const ok = database === "ok" && beating && !stopping;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(
    JSON.stringify({
      status: ok ? "ok" : "error",
      workerId,
      database,
      lastHeartbeatAt: lastBeatAt?.toISOString() ?? null,
      inFlight: runner.inFlight,
      queue,
    }),
  );
});

async function main() {
  log.info("starting", { workerId, healthPort: config.WORKER_HEALTH_PORT, concurrency: CONCURRENCY });
  await beat();
  await pruneOldHeartbeats();
  const timers = [
    setInterval(beat, HEARTBEAT_INTERVAL_MS),
    every(SCHEDULE_EVERY_MS, "schedule", () => runner.schedule()),
    every(CLAIM_EVERY_MS, "claim", () => runner.claim()),
  ];
  server.listen(config.WORKER_HEALTH_PORT, () =>
    log.info("health endpoint listening", { port: config.WORKER_HEALTH_PORT }),
  );

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("stopping", { workerId, signal, inFlight: runner.inFlight });
    timers.forEach(clearInterval);
    runner.stop();
    server.close();
    // Let running checks finish; anything left is recovered by lease expiry.
    await Promise.race([runner.drain(), new Promise((r) => setTimeout(r, 20_000))]);
    await closePdfBrowser();
    await db.$disconnect();
    log.info("stopped", { workerId });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

process.on("unhandledRejection", (error) => log.error("unhandled rejection", { error }));

main().catch((error) => {
  log.error("fatal", { error });
  process.exit(1);
});
