import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatClock, timeZoneAbbreviation } from "@/lib/format";
import { newestResultAt, nextSslSweepAt } from "@/lib/data/monitoring";
import { siteCounts } from "@/lib/data/sites";
import { getWorkerState } from "@/lib/heartbeat";
import { getPlan } from "@/lib/plans";
import { requireMembership } from "@/lib/session";
import { hasAccess } from "@/lib/billing/access";

// Footer status bar (design "Global shell"): dark ink, mono 12px. Never shows
// internal queue metrics, and never claims monitoring is current when the
// worker has gone quiet.

export async function StatusBar() {
  await connection();
  const ctx = await requireMembership();
  const { workspace } = ctx;
  const now = new Date();
  const tz = workspace.timezone;
  const intervalMs = getPlan(workspace.planKey).uptimeIntervalSeconds * 1000;
  const [worker, counts, newest, nextSsl] = await Promise.all([
    getWorkerState(db, now),
    siteCounts(db, ctx),
    newestResultAt(db, ctx),
    nextSslSweepAt(db, ctx),
  ]);
  // Results count as delayed when the worker is silent, or when it runs but nothing new has arrived.
  const resultsLate =
    counts.active > 0 && newest !== null && now.getTime() - newest.getTime() > 2 * intervalMs + 60_000;

  const view = !hasAccess(workspace.accessEndsAt, now)
    ? {
        dot: "text-bar-delayed",
        text: "Monitoring stopped — no active plan",
        detail: "Showing last known values",
      }
    : worker.kind === "never-started"
      ? {
          dot: "text-bar-delayed",
          text: "Monitoring not started",
          detail: "No check results will arrive until the worker starts",
        }
      : worker.kind === "delayed" || resultsLate
        ? {
            dot: "text-bar-delayed",
            text: `Results delayed since ${formatClock(resultsLate && newest ? newest : worker.lastSeenAt, tz, false)}`,
            detail: "Statuses show last known values until checks resume",
          }
        : counts.active === 0
          ? { dot: "text-bar-ok", text: "Monitoring ready", detail: "No websites being monitored" }
          : {
              dot: "text-bar-ok",
              text: "Monitoring current",
              detail: [
                newest ? `Newest result ${formatClock(newest, tz)}` : "First results arriving",
                nextSsl && nextSsl > now ? `next SSL sweep ${formatClock(nextSsl, tz, false)}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
            };

  return (
    <StatusBarFrame tz={tz} now={now}>
      <span role="status" className="whitespace-nowrap">
        <span aria-hidden="true" className={view.dot}>
          ●
        </span>{" "}
        {view.text}
      </span>
      <span className="whitespace-nowrap">{view.detail}</span>
    </StatusBarFrame>
  );
}

function StatusBarFrame({ tz, now, children }: { tz?: string; now?: Date; children?: React.ReactNode }) {
  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-1 bg-ink px-7 py-1.5 font-mono text-xs text-bar-text">
      {children}
      {tz && now ? (
        <span className="ml-auto whitespace-nowrap">
          Times in {tz} ({timeZoneAbbreviation(tz, now)})
        </span>
      ) : null}
    </footer>
  );
}

export function StatusBarFallback() {
  return (
    <StatusBarFrame>
      <span className="whitespace-nowrap">○ Checking monitoring status…</span>
    </StatusBarFrame>
  );
}
