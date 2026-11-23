import { z } from "zod";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { JsonFetcher } from "@/lib/monitoring/rdap";
import { rdapFetcher } from "@/lib/monitoring/rdap-fetch";
import type { SafeFetchOptions } from "@/lib/monitoring/safe-fetch";
import type { RateLimitStore } from "@/lib/rate-limit";
import { parseTarget, runDomainCheck, runSslCheck } from "@/lib/tools/checks";
import { MARKETING_OPT_IN_TEXT, REPORT_CONSENT_TEXT } from "@/lib/tools/consent";
import { json, readToolRequest, toolError } from "@/lib/tools/http";
import { allowReportEmail } from "@/lib/tools/limits";
import { startToolRun, ToolsBusyError, type QueuedTool } from "@/lib/tools/runs";
import { normalizeSiteUrl } from "@/lib/url";

// Request handling for /api/tools/* (the route files only pass the real database and limits in),
// so the security tests can drive every endpoint against the test database with hostile input.

export type ToolEndpointDeps = {
  db: Pick<PrismaClient, "toolRun" | "toolLead" | "job" | "$transaction">;
  store?: RateLimitStore;
  /** Test seams: DNS for the live checks. Private addresses stay blocked unless allowPrivate is set. */
  fetch?: Pick<SafeFetchOptions, "resolver" | "allowPrivate">;
  rdapFetch?: JsonFetcher;
  tlsPort?: number;
};

export async function handleSslCheck(request: Request, deps: ToolEndpointDeps): Promise<Response> {
  const req = await readToolRequest(request, "ssl-checker", deps.store);
  if (!req.ok) return req.response;
  const target = parseTarget(req.body.url);
  if (!target.ok) return toolError(target.error);
  const result = await runSslCheck(target.hostname, { ...deps.fetch, ...(deps.tlsPort ? { port: deps.tlsPort } : {}) });
  return json({ ok: true, result });
}

export async function handleDomainCheck(request: Request, deps: ToolEndpointDeps): Promise<Response> {
  const req = await readToolRequest(request, "domain-expiry-checker", deps.store);
  if (!req.ok) return req.response;
  const target = parseTarget(req.body.domain);
  if (!target.ok) return toolError(target.error);
  const result = await runDomainCheck(target.registrableDomain, deps.rdapFetch ?? rdapFetcher(deps.fetch));
  return json({ ok: true, result });
}

const BUSY = "Lots of checks are running right now. Try again in a few minutes.";

async function queue(deps: ToolEndpointDeps, tool: QueuedTool, url: string, lead?: Parameters<typeof startToolRun>[3]) {
  try {
    return json({ ok: true, ...(await startToolRun(deps.db, tool, url, lead)) }, 202);
  } catch (error) {
    if (error instanceof ToolsBusyError) return toolError(BUSY, 503);
    throw error;
  }
}

export async function handleLinkCheck(request: Request, deps: ToolEndpointDeps): Promise<Response> {
  const req = await readToolRequest(request, "broken-link-checker", deps.store);
  if (!req.ok) return req.response;
  const url = typeof req.body.url === "string" ? normalizeSiteUrl(req.body.url) : null;
  if (!url?.ok) return toolError(url?.error ?? "Enter a website address.");
  return queue(deps, "broken-link-checker", url.value.baseUrl);
}

const email = z.email().max(254);

/** Emails whatever address is typed in, so it's limited per IP, per address and per day overall. */
export async function handleHealthReport(request: Request, deps: ToolEndpointDeps): Promise<Response> {
  const req = await readToolRequest(request, "website-health-report", deps.store);
  if (!req.ok) return req.response;
  const { body, ip } = req;
  // Honeypot: a field people never see. Bots that fill it get a normal-looking answer.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true, runId: null }, 202);
  const url = typeof body.url === "string" ? normalizeSiteUrl(body.url) : null;
  if (!url?.ok) return toolError(url?.error ?? "Enter a website address.");
  const address = email.safeParse(typeof body.email === "string" ? body.email.trim() : "");
  if (!address.success) return toolError("Enter a valid email address.");
  if (!(await allowReportEmail(address.data, ip, Date.now(), deps.store))) {
    return toolError("We’ve sent the most reports we can to this address or network today. Try again tomorrow.", 429);
  }
  const marketingOptIn = body.marketingOptIn === true;
  return queue(deps, "website-health-report", url.value.baseUrl, {
    email: address.data.toLowerCase(),
    consent: marketingOptIn ? `${REPORT_CONSENT_TEXT} ${MARKETING_OPT_IN_TEXT}` : REPORT_CONSENT_TEXT,
    marketingOptIn,
  });
}
