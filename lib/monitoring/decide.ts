import type { IncidentSeverity, LiveStatus } from "@/lib/generated/prisma/enums";
import type { UptimeResult } from "@/lib/monitoring/classify";

// Pure incident/state decisions (spec §10.2). No I/O, so the rules are unit-tested.

/** Consecutive failures that confirm downtime, and passes that confirm recovery. */
export const CONFIRM_FAILURES = 2;
export const CONFIRM_RECOVERIES = 2;
/** Re-check sooner while confirming a failure or a recovery. */
export const CONFIRMATION_DELAY_MS = 30_000;
/** Consecutive slow responses before a site shows as Degraded. */
export const CONFIRM_SLOW = 2;

export type UptimeCounters = {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  consecutiveSlow: number;
  liveStatus: LiveStatus;
  statusDetail: string | null;
};

export type UptimeDecision = {
  next: UptimeCounters;
  openIncident: boolean;
  resolveIncident: boolean;
  /** Delay until the next check; null means the plan interval. */
  nextDelayMs: number | null;
};

export function decideUptime(state: UptimeCounters, result: UptimeResult, hasOpenDowntime: boolean): UptimeDecision {
  if (result.status === "inconclusive") {
    // Excluded from counts; the last conclusive state stands.
    return { next: state, openIncident: false, resolveIncident: false, nextDelayMs: null };
  }

  if (result.status === "failure") {
    const failures = state.consecutiveFailures + 1;
    const confirmed = failures >= CONFIRM_FAILURES;
    return {
      next: {
        consecutiveFailures: failures,
        consecutiveSuccesses: 0,
        consecutiveSlow: 0,
        liveStatus: confirmed || hasOpenDowntime ? "down" : "degraded",
        statusDetail: confirmed || hasOpenDowntime ? result.summary : `${result.summary} — 1st failure, confirming`,
      },
      openIncident: confirmed && !hasOpenDowntime,
      resolveIncident: false,
      nextDelayMs: confirmed && hasOpenDowntime ? null : CONFIRMATION_DELAY_MS,
    };
  }

  const successes = state.consecutiveSuccesses + 1;
  const slowRun = result.slow ? state.consecutiveSlow + 1 : 0;
  const slow = slowRun >= CONFIRM_SLOW;
  if (hasOpenDowntime) {
    const recovered = successes >= CONFIRM_RECOVERIES;
    return {
      next: {
        consecutiveFailures: 0,
        consecutiveSuccesses: successes,
        consecutiveSlow: slowRun,
        liveStatus: recovered ? (slow ? "degraded" : "up") : "down",
        statusDetail: recovered
          ? slow
            ? `Slow · ${result.summary}`
            : null
          : `Recovering — ${successes} of ${CONFIRM_RECOVERIES} recovery checks passed`,
      },
      openIncident: false,
      resolveIncident: recovered,
      nextDelayMs: recovered ? null : CONFIRMATION_DELAY_MS,
    };
  }
  return {
    next: {
      consecutiveFailures: 0,
      consecutiveSuccesses: successes,
      consecutiveSlow: slowRun,
      liveStatus: slow ? "degraded" : "up",
      statusDetail: slow ? `Slow · ${result.summary}` : result.category === "http_4xx" ? result.summary : null,
    },
    openIncident: false,
    resolveIncident: false,
    nextDelayMs: null,
  };
}

/** Severity for an approaching expiry: the 30/14/7/1-day thresholds (FR-SSL-04). */
export function expirySeverity(daysLeft: number): IncidentSeverity {
  if (daysLeft <= 1) return "critical";
  if (daysLeft <= 7) return "high";
  if (daysLeft <= 14) return "medium";
  return "low";
}

/** Which threshold (30/14/7/1) a number of days has crossed. */
export function thresholdReached(daysLeft: number): number {
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 14) return 14;
  return 30;
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Next 00/06/12/18 UTC sweep after `now`, offset by a stable per-site jitter. */
export function nextSweep(now: Date, everyHours: number, offsetHours: number, jitterMs: number): Date {
  const step = everyHours * 3_600_000;
  const offset = offsetHours * 3_600_000;
  const t = Math.floor((now.getTime() - offset) / step) * step + offset + step;
  return new Date(t + jitterMs);
}

/** Stable 0–max ms jitter from an id, so sweeps don't all fire at once. */
export function jitterFor(id: string, maxMs: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % maxMs;
}
