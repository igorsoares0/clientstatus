import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutgoingEmail } from "@/lib/email";
import type { ClaimedJob } from "@/lib/jobs/queue";
import { memoryStore } from "@/lib/rate-limit";
import { REPORT_CONSENT_TEXT } from "@/lib/tools/consent";
import {
  handleDomainCheck,
  handleHealthReport,
  handleLinkCheck,
  handleSslCheck,
  type ToolEndpointDeps,
} from "@/lib/tools/endpoints";
import { runToolJob } from "@/lib/tools/jobs";
import { MAX_ACTIVE_RUNS } from "@/lib/tools/runs";
import { db } from "./helpers";

// Security tests for the free tools (docs/pseo-plan.md §4 checklist, spec §13 style): every
// endpoint refuses private addresses at input, and anything that resolves to one at connection
// time (DNS rebinding) is blocked before a socket opens. A loopback server counts connections.

const sendEmail = vi.hoisted(() =>
  vi.fn<(email: OutgoingEmail) => Promise<{ providerMessageId: string | null }>>(async () => ({
    providerMessageId: null,
  })),
);
vi.mock("@/lib/email", async (original) => ({ ...(await original<typeof import("@/lib/email")>()), sendEmail }));

let server: Server;
let port: number;
let connections = 0;

beforeAll(async () => {
  server = createServer((socket) => {
    connections++;
    socket.end("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "tool_run", "tool_lead", "job" CASCADE');
  connections = 0;
  sendEmail.mockClear();
});

/** A "public" name that resolves to loopback: what a rebinding attacker controls. */
const rebinding = { resolver: async () => [{ address: "127.0.0.1", family: 4 }] };

const ORIGIN = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/tools/x`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers },
    body: JSON.stringify(body),
  });
}

const deps = (over: Partial<ToolEndpointDeps> = {}): ToolEndpointDeps => ({ db, store: memoryStore(), ...over });

const HOSTILE = [
  "http://localhost",
  "http://127.0.0.1",
  "http://[::1]",
  "http://169.254.169.254/latest/meta-data",
  "http://10.0.0.1",
  "http://metadata.google.internal",
  "file:///etc/passwd",
  "gopher://example.com",
];

const ENDPOINTS = [
  { name: "ssl-checker", run: handleSslCheck, body: (u: string) => ({ url: u }) },
  { name: "domain-expiry-checker", run: handleDomainCheck, body: (u: string) => ({ domain: u }) },
  { name: "broken-link-checker", run: handleLinkCheck, body: (u: string) => ({ url: u }) },
  {
    name: "website-health-report",
    run: handleHealthReport,
    body: (u: string) => ({ url: u, email: "me@agency.example.com" }),
  },
];

describe.each(ENDPOINTS)("$name", ({ run, body }) => {
  it.each(HOSTILE)("refuses %s at input and queues nothing", async (url) => {
    const res = await run(post(body(url)), deps());
    expect(res.status).toBe(400);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(await db.toolRun.count()).toBe(0);
  });

  it("refuses requests from other sites", async () => {
    const res = await run(post(body("example.com"), { origin: "https://evil.example.com" }), deps());
    expect(res.status).toBe(403);
  });

  it("refuses non-JSON and oversized bodies", async () => {
    const bad = new Request(`${ORIGIN}/api/tools/x`, { method: "POST", headers: { origin: ORIGIN }, body: "url=x" });
    expect((await run(bad, deps())).status).toBe(400);
    expect((await run(post({ url: "a".repeat(5000) }), deps())).status).toBe(413);
  });

  it("rate-limits per IP", async () => {
    const d = deps();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await run(post(body("http://127.0.0.1")), d)).status;
    expect(last).toBe(429);
  });
});

describe("DNS rebinding at connection time", () => {
  it("SSL checker never connects to a name that resolves to loopback", async () => {
    const res = await handleSslCheck(post({ url: "rebind.example.com" }), deps({ fetch: rebinding, tlsPort: port }));
    const { result } = (await res.json()) as { result: { state: string } };
    expect(result.state).not.toBe("valid");
    expect(connections).toBe(0);
  });

  it("domain checker never fetches RDAP from a loopback address", async () => {
    const res = await handleDomainCheck(post({ domain: "rebind.example.com" }), deps({ fetch: rebinding }));
    const { result } = (await res.json()) as { result: { state: string } };
    expect(result.state).toBe("unknown");
    expect(connections).toBe(0);
  });

  const job = (runId: string, jobType: string): ClaimedJob => ({
    id: "job",
    workspaceId: null,
    jobType,
    resourceType: "tool_run",
    resourceId: runId,
    payload: null,
    attempts: 1,
    maxAttempts: 1,
    runAt: new Date(),
  });

  const jobDeps = {
    now: () => new Date(),
    fetch: rebinding,
    rdapFetch: async () => ({ status: 503, json: null }),
    tlsPort: port,
    sleep: async () => undefined,
    renderPdf: async () => Buffer.from("%PDF-test"),
  };

  it("broken-link crawl of a rebinding name reaches nothing", async () => {
    const res = await handleLinkCheck(post({ url: `http://rebind.example.com:${port}` }), deps());
    const { runId } = (await res.json()) as { runId: string };
    await runToolJob(db, job(runId, "tool_broken_links"), jobDeps);
    const run = await db.toolRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("completed");
    // The crawler counts the start page as attempted; nothing was fetched or checked.
    expect((run.result as { linksChecked: number }).linksChecked).toBe(0);
    expect(connections).toBe(0);
  });

  it("health report of a rebinding name reaches nothing and still says so honestly", async () => {
    const res = await handleHealthReport(
      post({ url: `http://rebind.example.com:${port}`, email: "me@agency.example.com" }),
      deps(),
    );
    const { runId } = (await res.json()) as { runId: string };
    await runToolJob(db, job(runId, "tool_health_report"), jobDeps);
    expect(connections).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0]![0];
    expect(email.to).toBe("me@agency.example.com");
    expect(email.attachments?.[0]?.filename).toBe("website-health-rebind.example.com.pdf");
    expect((await db.toolRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("completed");
  });
});

describe("health report requests", () => {
  it("stores the lead with the consent text shown and no marketing opt-in by default", async () => {
    const res = await handleHealthReport(post({ url: "example.com", email: " Me@Agency.example.com " }), deps());
    expect(res.status).toBe(202);
    const lead = await db.toolLead.findFirstOrThrow();
    expect(lead).toMatchObject({
      email: "me@agency.example.com",
      url: "https://example.com",
      consent: REPORT_CONSENT_TEXT,
      marketingOptIn: false,
    });
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({ jobType: "tool_health_report", priority: -10, maxAttempts: 1, workspaceId: null });
  });

  it("records an explicit opt-in with its text", async () => {
    await handleHealthReport(post({ url: "example.com", email: "a@agency.example.com", marketingOptIn: true }), deps());
    const lead = await db.toolLead.findFirstOrThrow();
    expect(lead.marketingOptIn).toBe(true);
    expect(lead.consent).toContain("product updates");
  });

  it("ignores honeypot submissions without saying so", async () => {
    const res = await handleHealthReport(
      post({ url: "example.com", email: "bot@agency.example.com", website: "http://spam.example.com" }),
      deps(),
    );
    expect(res.status).toBe(202);
    expect(await db.toolLead.count()).toBe(0);
  });

  it("refuses bad email addresses and floods to one address", async () => {
    expect((await handleHealthReport(post({ url: "example.com", email: "nope" }), deps())).status).toBe(400);
    const d = deps();
    const send = (ip: string) =>
      handleHealthReport(
        post({ url: "example.com", email: "victim@agency.example.com" }, { "x-forwarded-for": ip }),
        d,
      );
    expect((await send("198.51.100.1")).status).toBe(202);
    expect((await send("198.51.100.2")).status).toBe(202);
    expect((await send("198.51.100.3")).status).toBe(429);
  });

  it("refuses new runs while the queue is full", async () => {
    await db.toolRun.createMany({
      data: Array.from({ length: MAX_ACTIVE_RUNS }, () => ({
        tool: "broken-link-checker",
        url: "https://example.com",
      })),
    });
    const res = await handleLinkCheck(post({ url: "example.com" }), deps());
    expect(res.status).toBe(503);
  });
});
