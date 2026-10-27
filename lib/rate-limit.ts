// Small in-process fixed-window limiter for public, unauthenticated routes
// (spec §8.2: rate-limit report-token access). Per process; good enough to
// blunt scraping and brute force on top of 256-bit tokens.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
