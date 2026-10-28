// Load test for the plan assumptions (spec §5, §15 Phase 5): can one worker
// keep every site on its plan's uptime interval? Runs the real scheduler,
// queue, runner and uptime handler against a local HTTP server with realistic
// latencies — no third-party site is contacted — and reports pickup lag,
// schedule drift and throughput.
//
//   npm run load-test -- --workspaces 5 --plan pro --concurrency 8 --minutes 3
//
// Uses its own database (LOAD_DATABASE_URL, default clientstatus_load on the
// local Postgres), created and migrated on first run and wiped on every run.

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { createPrismaClient } from "@/lib/db";
import { createRunner } from "@/lib/jobs/runner";
import { ensureSiteStates } from "@/lib/monitoring/scheduler";
import { PLANS, isPlanKey } from "@/lib/plans";

const { values: args } = parseArgs({
  options: {
    workspaces: { type: "string", default: "1" },
    plan: { type: "string", default: "pro" },
    sites: { type: "string" },
    // Same default as the worker (worker/index.ts).
    concurrency: { type: "string", default: process.env.WORKER_CONCURRENCY || "32" },
    minutes: { type: "string", default: "3" },
  },
});

const plan = isPlanKey(args.plan!) ? PLANS[args.plan] : PLANS.pro;
const workspaces = Number(args.workspaces);
const sitesPerWorkspace = Number(args.sites ?? plan.maxActiveSites);
const concurrency = Number(args.concurrency);
const durationMs = Number(args.minutes) * 60_000;
const intervalMs = plan.uptimeIntervalSeconds * 1000;

/** Response time mix seen on real agency sites: mostly fast, a slow tail, rare hangs. */
function latencyMs(): number {
  const r = Math.random();
  if (r < 0.7) return 80 + Math.random() * 320; // 80–400 ms
  if (r < 0.95) return 400 + Math.random() * 1100; // 0.4–1.5 s
  if (r < 0.995) return 1500 + Math.random() * 4500; // 1.5–6 s
  return 12_000; // hangs past the 10 s timeout
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

async function prepareDatabase(url: string) {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pg = new Client({ connectionString: admin.toString() });
  await pg.connect();
  const exists = await pg.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!exists.rowCount) await pg.query(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
  await pg.end();
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}

async function main() {
  const base = new URL(process.env.DATABASE_URL!);
  base.pathname = "/clientstatus_load";
  const url = process.env.LOAD_DATABASE_URL ?? base.toString();
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Load tests only run on a local database.");
  await prepareDatabase(url);
  const db = createPrismaClient(url, concurrency + 6);

  const server = createServer((req, res) => {
    setTimeout(() => {
      if (!res.destroyed) res.writeHead(200, { "content-type": "text/html" }).end("<html><body>ok</body></html>");
    }, latencyMs());
  });
  server.keepAliveTimeout = 5000;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  await db.$executeRawUnsafe(
    'TRUNCATE "job", "monitor_check", "site_state", "incident_event", "incident", "site", "workspace", "worker_heartbeat" CASCADE',
  );
  const total = workspaces * sitesPerWorkspace;
  for (let w = 0; w < workspaces; w++) {
    const ws = await db.workspace.create({
      data: {
        name: `Load ${w}`,
        slug: `load-${w}-${Date.now()}`,
        timezone: "UTC",
        planKey: plan.key,
        accessEndsAt: null,
      },
    });
    await db.site.createMany({
      data: Array.from({ length: sitesPerWorkspace }, (_, i) => {
        const host = `w${w}-s${i}.load.test`;
        return {
          workspaceId: ws.id,
          name: host,
          nameKey: host,
          baseUrl: `http://${host}:${port}/`,
          normalizedHostname: host,
          liveHostKey: host,
        };
      }),
    });
  }
  const start = new Date();
  await ensureSiteStates(db, start);
  // Uptime only: SSL, domain and audit checks would reach the network.
  const far = new Date(start.getTime() + 365 * 86_400_000);
  await db.siteState.updateMany({ data: { nextSslCheckAt: far, nextDomainCheckAt: far, nextAuditAt: far } });

  const runner = createRunner(db, {
    workerId: `load-${process.pid}`,
    concurrency,
    refill: true,
    deps: {
      now: () => new Date(),
      fetch: { resolver: async () => [{ address: "127.0.0.1", family: 4 }], allowPrivate: true },
    },
  });

  const required = total / (intervalMs / 1000);
  console.log(
    `${workspaces} × ${sitesPerWorkspace} ${plan.name} sites = ${total} sites every ${plan.uptimeIntervalSeconds}s ` +
      `→ needs ${required.toFixed(1)} checks/s · concurrency ${concurrency} · ${args.minutes} min`,
  );

  const depth: number[] = [];
  let stopping = false;
  const loop = (ms: number, fn: () => Promise<unknown>) =>
    (async () => {
      while (!stopping) {
        const t = Date.now();
        await fn().catch((e) => console.error(e));
        await new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - t))));
      }
    })();
  const loops = [
    loop(5000, () => runner.schedule()),
    loop(1000, () => runner.claim()),
    loop(5000, async () =>
      depth.push(await db.job.count({ where: { status: "pending", runAt: { lte: new Date() } } })),
    ),
  ];
  await new Promise((r) => setTimeout(r, durationMs));
  stopping = true;
  await Promise.all(loops);
  await runner.drain();
  const end = new Date();

  // Skip the first interval: every site starts due at once, which isn't steady state.
  const steadyFrom = new Date(start.getTime() + intervalMs);
  const jobs = await db.job.findMany({
    where: { jobType: "uptime_check", status: "completed", runAt: { gte: steadyFrom } },
    select: { runAt: true, startedAt: true },
  });
  const lags = jobs.map((j) => (j.startedAt!.getTime() - j.runAt.getTime()) / 1000).sort((a, b) => a - b);
  const checks = await db.monitorCheck.findMany({
    where: { checkType: "uptime" },
    orderBy: [{ siteId: "asc" }, { checkedAt: "asc" }],
    select: { siteId: true, checkedAt: true, status: true },
  });
  const gaps: number[] = [];
  for (let i = 1; i < checks.length; i++) {
    const [a, b] = [checks[i - 1]!, checks[i]!];
    if (a.siteId === b.siteId && b.checkedAt >= steadyFrom)
      gaps.push((b.checkedAt.getTime() - a.checkedAt.getTime()) / 1000);
  }
  gaps.sort((a, b) => a - b);
  const steadySeconds = (end.getTime() - steadyFrom.getTime()) / 1000;
  const inconclusive = checks.filter((c) => c.status === "inconclusive").length;
  const result = {
    scenario: {
      plan: plan.key,
      workspaces,
      sitesPerWorkspace,
      total,
      intervalSeconds: plan.uptimeIntervalSeconds,
      concurrency,
    },
    requiredChecksPerSecond: Number(required.toFixed(2)),
    achievedChecksPerSecond: Number((jobs.length / steadySeconds).toFixed(2)),
    pickupLagSeconds: { p50: pct(lags, 0.5), p95: pct(lags, 0.95), max: lags.at(-1) ?? 0 },
    intervalBetweenChecksSeconds: { p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), max: gaps.at(-1) ?? 0 },
    queueDepthDue: { max: Math.max(0, ...depth), last: depth.at(-1) ?? 0 },
    inconclusiveShare: Number((inconclusive / Math.max(1, checks.length)).toFixed(3)),
  };
  console.log(JSON.stringify(result, null, 2));

  server.close();
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
