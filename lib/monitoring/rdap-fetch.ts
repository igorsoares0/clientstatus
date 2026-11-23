import type { JsonFetcher } from "@/lib/monitoring/rdap";
import { safeFetch, type SafeFetchOptions } from "@/lib/monitoring/safe-fetch";

// RDAP lookups over the guarded fetch layer. Kept apart from lib/monitoring/handlers.ts so web
// routes (the free domain-expiry checker) can use it without loading the worker's job handlers.

const RDAP_TIMEOUT_MS = 15_000;

/** RDAP over the same guarded fetch layer. */
export function rdapFetcher(fetchOpts: Pick<SafeFetchOptions, "resolver" | "allowPrivate"> = {}): JsonFetcher {
  return async (url) => {
    const res = await safeFetch(url, { timeoutMs: RDAP_TIMEOUT_MS, maxBytes: 1024 * 1024, ...fetchOpts });
    let json: unknown = null;
    try {
      json = JSON.parse(res.bodySnippet);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
}
