// Check-based uptime (spec §10.1): successful ÷ (successful + failed) checks in
// the period. Inconclusive checks are excluded; missing checks are never
// counted as up — coverage reports how much of the period was actually checked.

export type CheckCounts = { success: number; failure: number; inconclusive: number };

export type Uptime = {
  /** 0–100, or null when there are no conclusive checks. */
  percent: number | null;
  conclusive: number;
  completed: number;
  /** 0–1 share of expected checks that ran, or null when unknown. */
  coverage: number | null;
};

export function computeUptime(c: CheckCounts, expectedChecks: number | null): Uptime {
  const conclusive = c.success + c.failure;
  const completed = conclusive + c.inconclusive;
  return {
    percent: conclusive === 0 ? null : (c.success / conclusive) * 100,
    conclusive,
    completed,
    coverage: expectedChecks && expectedChecks > 0 ? Math.min(1, completed / expectedChecks) : null,
  };
}

/** "99.87%" — two decimals, but never rounds a non-perfect result up to 100%. */
export function formatPercent(p: number | null): string {
  if (p === null) return "—";
  if (p < 100 && p >= 99.995) return "99.99%";
  return `${p.toFixed(2)}%`;
}
