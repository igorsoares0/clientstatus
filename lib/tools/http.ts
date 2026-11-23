import { env } from "@/lib/env";
import { clientIp, type RateLimitStore } from "@/lib/rate-limit";
import { allowToolRequest, type ToolSlug } from "@/lib/tools/limits";

// Shared plumbing for /api/tools/* route handlers: results are never indexable or cached,
// requests must come from our own pages, bodies are small JSON, and every call is rate-limited.

const MAX_BODY_BYTES = 4 * 1024;

export const NO_INDEX_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_INDEX_HEADERS, ...extra } });
}

export function toolError(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

/** Same-origin check: browsers always send Origin on POST, so other sites can't drive the tools. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(env().BETTER_AUTH_URL).origin]);
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}

export type ToolRequest = { ok: true; body: Record<string, unknown>; ip: string } | { ok: false; response: Response };

/** Origin, size, JSON and rate-limit checks shared by every tool endpoint. */
export async function readToolRequest(request: Request, tool: ToolSlug, store?: RateLimitStore): Promise<ToolRequest> {
  if (!sameOrigin(request)) return { ok: false, response: toolError("Use the form on our website.", 403) };
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, response: toolError("Request too large.", 413) };
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, response: toolError("Request too large.", 413) };
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: toolError("Send JSON.") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, response: toolError("Send JSON.") };
  }
  const ip = clientIp(request.headers);
  if (!(await allowToolRequest(tool, ip, Date.now(), store))) {
    return {
      ok: false,
      response: json({ ok: false, error: "Too many checks. Try again in a few minutes." }, 429, {
        "Retry-After": "600",
      }),
    };
  }
  return { ok: true, body: body as Record<string, unknown>, ip };
}
