import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// Fixed-window rate limits for auth and public routes (spec §8.2). Counters live
// in Postgres, so every web instance shares them, and each check is one atomic
// upsert, so concurrent requests can't all slip under the limit. Keys are stored
// hashed: they contain email and IP addresses.

export type RateLimitStore = {
  /** Counts one hit and returns the window's total so far and when it resets. */
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
};

export function postgresStore(client: Pick<PrismaClient, "$queryRaw">): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const at = new Date(now);
      const resetAt = new Date(now + windowMs);
      const [row] = await client.$queryRaw<{ count: number; resetAt: Date }[]>`
        INSERT INTO "rate_limit_bucket" ("key", "count", "resetAt")
        VALUES (${createHash("sha256").update(key).digest("hex")}, 1, ${resetAt})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "rate_limit_bucket"."resetAt" <= ${at} THEN 1 ELSE "rate_limit_bucket"."count" + 1 END,
          "resetAt" = CASE WHEN "rate_limit_bucket"."resetAt" <= ${at} THEN ${resetAt} ELSE "rate_limit_bucket"."resetAt" END
        RETURNING "count", "resetAt"`;
      return { count: row!.count, resetAt: row!.resetAt.getTime() };
    },
  };
}

/** Per-process store for unit tests. */
export function memoryStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs, now) {
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        buckets.set(key, fresh);
        return fresh;
      }
      b.count++;
      return b;
    },
  };
}

let shared: RateLimitStore | undefined;

export function defaultStore(): RateLimitStore {
  shared ??= postgresStore(db);
  return shared;
}

export async function allow(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  store = defaultStore(),
): Promise<boolean> {
  return (await store.hit(key, windowMs, now)).count <= limit;
}

/** Better Auth's rate limiter on the same counters (its windows are in seconds). */
export function betterAuthRateLimitStorage(store?: RateLimitStore) {
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const now = Date.now();
      const { count, resetAt } = await (store ?? defaultStore()).hit(`auth:${key}`, rule.window * 1000, now);
      return count <= rule.max
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    },
  };
}

// ─── Client address ───────────────────────────────────────────────────────

type IpConfig = { hops: number; header?: string };

/**
 * The client's address as seen by our own proxies. The left end of X-Forwarded-For
 * is whatever the client sent, so it's read from the right: each trusted proxy
 * appends the address it received the request from. Next.js only fills the header
 * when it's missing, so without a proxy in front nothing here can be trusted.
 */
export function clientIp(
  headers: Headers,
  config: IpConfig = { hops: env().TRUSTED_PROXY_HOPS, header: env().CLIENT_IP_HEADER },
): string {
  const candidate = config.header
    ? headers.get(config.header)?.trim()
    : headers
        .get("x-forwarded-for")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .at(-config.hops);
  return candidate && isIP(candidate) ? candidate : "unknown";
}

/** Set by us, never trusted from the client: where Better Auth reads the address (lib/auth.ts). */
export const RESOLVED_IP_HEADER = "x-clientstatus-client-ip";

/** A copy of `headers` carrying the resolved client address for Better Auth. */
export function withResolvedIp(headers: Headers): Headers {
  const out = new Headers(headers);
  out.delete(RESOLVED_IP_HEADER);
  const ip = clientIp(headers);
  if (ip !== "unknown") out.set(RESOLVED_IP_HEADER, ip);
  return out;
}
