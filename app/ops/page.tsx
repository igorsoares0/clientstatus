import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { isOpsAdmin } from "@/lib/ops/access";
import { opsMetrics, recentFailedJobs } from "@/lib/ops/metrics";
import { requireUser } from "@/lib/session";
import { RequeueButton } from "./requeue-button";

export const metadata: Metadata = { title: "Operations", robots: { index: false, follow: false } };

// Internal operational dashboard (FR-OPS-03/04): worker health, queue depth and
// age, check latency and error rate, email failures, billing webhooks, failed
// jobs with a safe requeue. Allowlisted staff only; everyone else gets a 404.

export default function OpsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-baseline gap-4 border-b border-border bg-surface px-7 py-4">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Operations</h1>
        <span className="text-[13px] text-muted">Internal · counts only, no customer content</span>
      </header>
      <Suspense
        fallback={
          <div className="p-7">
            <PanelSkeleton />
          </div>
        }
      >
        <OpsDashboard />
      </Suspense>
    </div>
  );
}

const box = "border border-border bg-surface";
const head = "m-0 border-b border-border px-4 py-3 text-[15px] font-semibold";
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function age(seconds: number) {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

async function OpsDashboard() {
  await connection();
  const user = await requireUser();
  if (!isOpsAdmin(user.email)) notFound();
  const now = new Date();
  const [m, failed] = await Promise.all([opsMetrics(db, now), recentFailedJobs(db, now)]);
  const aliveWorkers = m.workers.filter((w) => w.alive).length;
  const queueLate = m.queue.oldestDueAgeSeconds > 120;

  const tiles: { label: string; value: string; sub: string; bad?: boolean }[] = [
    {
      label: "Workers alive",
      value: String(aliveWorkers),
      sub: aliveWorkers ? `${m.workers.length} seen in 24 h` : "No heartbeat in the last minute",
      bad: aliveWorkers === 0,
    },
    {
      label: "Queue due now",
      value: String(m.queue.pendingDue),
      sub: `oldest waiting ${age(m.queue.oldestDueAgeSeconds)} · ${m.queue.running} running`,
      bad: queueLate,
    },
    {
      label: "Check failures (1 h)",
      value: pct(m.checksLastHour.failureRate),
      sub: `${m.checksLastHour.total} checks · ${pct(m.checksLastHour.inconclusiveRate)} inconclusive`,
    },
    {
      label: "Uptime latency (1 h)",
      value: m.checksLastHour.uptimeLatencyMs.p50 === null ? "—" : `${m.checksLastHour.uptimeLatencyMs.p50} ms`,
      sub:
        m.checksLastHour.uptimeLatencyMs.p95 === null
          ? "no samples"
          : `p95 ${m.checksLastHour.uptimeLatencyMs.p95} ms · ${m.checksLastHour.uptimeLatencyMs.samples} samples`,
    },
    {
      label: "Email failures (24 h)",
      value: String(m.emailsLast24h.failed + m.emailsLast24h.bounced),
      sub: `${m.emailsLast24h.sent} sent · ${m.emailsLast24h.pending} pending · ${m.emailsLast24h.bounced} bounced`,
      bad: m.emailsLast24h.failed > 0,
    },
    {
      label: "Jobs failed (24 h)",
      value: String(m.queue.failedLast24h),
      sub: `${m.failedReportsLast7d} reports failed in 7 days`,
      bad: m.queue.failedLast24h > 0,
    },
  ];

  return (
    <main className="flex flex-col gap-5 p-7">
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 p-0">
        {tiles.map((t) => (
          <li key={t.label} className={`${box} flex flex-col gap-1 px-4 py-3`}>
            <span className="text-xs tracking-[.03em] text-muted">{t.label.toUpperCase()}</span>
            <span className={`text-2xl font-semibold tabular font-stretch-85% ${t.bad ? "text-down" : ""}`}>
              {t.bad ? <span aria-hidden="true">◆ </span> : null}
              {t.value}
            </span>
            <span className="text-xs text-muted tabular">{t.sub}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="h-q" className={`${box} min-w-0 flex-[1_1_420px]`}>
          <h2 id="h-q" className={head}>
            Queue by job type
          </h2>
          <table className="w-full border-collapse text-[13px] tabular">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-normal">Type</th>
                <th className="px-4 py-2 text-right font-normal">Due</th>
                <th className="px-4 py-2 text-right font-normal">Running</th>
                <th className="px-4 py-2 text-right font-normal">Oldest due</th>
              </tr>
            </thead>
            <tbody>
              {m.queue.byType.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-muted">
                    Queue empty.
                  </td>
                </tr>
              ) : (
                m.queue.byType.map((r) => (
                  <tr key={r.jobType} className="border-t border-rule-soft">
                    <td className="px-4 py-2 font-mono text-[12.5px]">{r.jobType}</td>
                    <td className="px-4 py-2 text-right">{r.pendingDue}</td>
                    <td className="px-4 py-2 text-right">{r.running}</td>
                    <td className={`px-4 py-2 text-right ${r.oldestDueAgeSeconds > 120 ? "text-down" : ""}`}>
                      {r.pendingDue ? age(r.oldestDueAgeSeconds) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="h-w" className={`${box} min-w-0 flex-[1_1_360px]`}>
          <h2 id="h-w" className={head}>
            Workers
          </h2>
          <ul className="m-0 list-none p-0 text-[13px]">
            {m.workers.length === 0 ? <li className="px-4 py-3 text-muted">No worker has started.</li> : null}
            {m.workers.map((w) => (
              <li
                key={w.workerId}
                className="flex items-baseline gap-3 border-t border-rule-soft px-4 py-2 first:border-t-0"
              >
                <span className={w.alive ? "text-up" : "text-muted"}>
                  <span aria-hidden="true">{w.alive ? "●" : "○"}</span> {w.alive ? "Alive" : "Gone"}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{w.workerId}</span>
                <span className="font-mono text-[12px] text-muted">{w.lastSeenAt.slice(11, 19)} UTC</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-b" className={`${box} min-w-0 flex-[1_1_300px]`}>
          <h2 id="h-b" className={head}>
            Billing
          </h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px] tabular">
            <dt className="text-muted">Paid workspaces</dt>
            <dd className="m-0 text-right">{m.workspaces.paid}</dd>
            <dt className="text-muted">On trial</dt>
            <dd className="m-0 text-right">{m.workspaces.trial}</dd>
            <dt className="text-muted">Past due (in grace)</dt>
            <dd className="m-0 text-right">{m.workspaces.pastDue}</dd>
            <dt className="text-muted">No active plan</dt>
            <dd className="m-0 text-right">{m.workspaces.lapsed}</dd>
            <dt className="text-muted">Webhooks applied (24 h)</dt>
            <dd className="m-0 text-right">{m.billingEventsLast24h.applied ?? 0}</dd>
            <dt className="text-muted">Webhooks ignored (24 h)</dt>
            <dd className="m-0 text-right">{m.billingEventsLast24h.ignored ?? 0}</dd>
          </dl>
        </section>
      </div>

      <section aria-labelledby="h-f" className={box}>
        <h2 id="h-f" className={head}>
          Failed jobs · last 7 days
        </h2>
        {failed.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-muted">None.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2 font-normal">Failed</th>
                  <th className="px-4 py-2 font-normal">Type</th>
                  <th className="px-4 py-2 font-normal">Resource</th>
                  <th className="px-4 py-2 font-normal">Attempts</th>
                  <th className="px-4 py-2 font-normal">Last error</th>
                  <th className="px-4 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {failed.map((j) => (
                  <tr key={j.id} className="border-t border-rule-soft align-top">
                    <td className="px-4 py-2 font-mono text-[12px] whitespace-nowrap">
                      {j.completedAt?.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]">{j.jobType}</td>
                    <td className="px-4 py-2 font-mono text-[12px] text-muted">
                      {j.resourceType}:{j.resourceId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 tabular">{j.attempts}</td>
                    <td className="max-w-[420px] px-4 py-2 break-words text-ink-2">{j.lastError ?? "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <RequeueButton jobId={j.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="m-0 text-xs text-muted">
        Generated {m.generatedAt.slice(11, 19)} UTC · the same numbers are available as JSON on the worker’s internal
        /metrics endpoint.
      </p>
    </main>
  );
}
