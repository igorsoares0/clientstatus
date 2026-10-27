import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { manualAuditAllowance, openFindings, requestManualAudit } from "@/lib/data/audits";
import { crawlSite, type CrawlLimits } from "@/lib/crawler/crawl";
import { createRunner } from "@/lib/jobs/runner";
import { enqueue } from "@/lib/jobs/queue";
import { safeFetch } from "@/lib/monitoring/safe-fetch";
import type { TenantContext } from "@/lib/data/tenant";
import { db, resetDb, workspaceWithOwner } from "./helpers";

// A small site served locally. 127.0.0.1 is "the site"; links to localhost are "external".
let server: Server;
let port = 0;
let hits = new Map<string, number>();
let missingFixed = false;

const page = (title: string | null, body: string, extra = "") =>
  `<!doctype html><html><head>${title === null ? "" : `<title>${title}</title>`}<meta name="description" content="d"><link rel="canonical" href="/">${extra}</head><body>${body}</body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? "/";
    const n = (hits.get(path) ?? 0) + 1;
    hits.set(path, n);
    const html = (s: string) => res.writeHead(200, { "content-type": "text/html" }).end(s);
    const redirect = (to: string) => res.writeHead(302, { location: to }).end();
    switch (path) {
      case "/robots.txt":
        return res
          .writeHead(200, { "content-type": "text/plain" })
          .end(`User-agent: *\nDisallow: /secret\nSitemap: http://127.0.0.1:${port}/sitemap.xml\n`);
      case "/sitemap.xml":
        return res.writeHead(200, { "content-type": "application/xml" }).end("<urlset/>");
      case "/":
        return html(
          page(
            "Home",
            `<h1>Home</h1>
             <a href="/about">About</a> <a href="/missing">Missing</a> <a href="/secret/page">Secret</a>
             <a href="/loop-a">Loop</a> <a href="/chain1">Chain</a> <a href="/flaky">Flaky</a>
             <a href="/brochure.pdf">PDF</a>
             <a href="http://localhost:${port}/gone">Gone</a> <a href="http://localhost:${port}/busy">Busy</a>`,
          ),
        );
      case "/about":
        return html(`<html><head></head><body><a href="/">Home</a><a href="/missing">Missing again</a></body></html>`);
      case "/missing":
        return missingFixed ? html(page("Found", "<h1>Found</h1>")) : res.writeHead(404).end("nope");
      case "/flaky":
        return n === 1 ? res.writeHead(404).end() : html(page("Flaky", "<h1>Flaky</h1>"));
      case "/loop-a":
        return redirect("/loop-b");
      case "/loop-b":
        return redirect("/loop-a");
      case "/chain1":
        return redirect("/chain2");
      case "/chain2":
        return redirect("/chain3");
      case "/chain3":
        return redirect("/chain4");
      case "/chain4":
        return redirect("/chain5");
      case "/chain5":
        return html(page("End", "<h1>End</h1>"));
      case "/brochure.pdf":
        return res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
      case "/gone":
        return res.writeHead(410).end();
      case "/busy":
        return res.writeHead(429).end();
      default:
        return res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "audit_finding", "audit_run", "job" CASCADE');
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  await db.$executeRawUnsafe('TRUNCATE "audit_finding", "audit_run", "job" CASCADE');
  hits = new Map();
  missingFixed = false;
});

const limits: CrawlLimits = {
  maxPages: 50,
  maxDepth: 5,
  maxRequests: 200,
  timeoutMs: 3000,
  maxRuntimeMs: 30_000,
  delayMs: 0,
  hostConcurrency: 2,
  respectRobots: true,
  retryDelayMs: 0,
};
const deps = {
  fetch: (url: string, o: { maxBytes: number; timeoutMs: number }) => safeFetch(url, { ...o, allowPrivate: true }),
  clock: () => Date.now(),
  sleep: async () => {},
};

describe("crawlSite", () => {
  it("finds broken links, redirect problems and SEO gaps, respects robots.txt and retries before calling a link broken", async () => {
    const r = await crawlSite(`http://127.0.0.1:${port}/`, limits, deps);
    expect(r.status).toBe("completed");
    expect(r.robots).toBe("ok");
    expect(hits.get("/secret/page")).toBeUndefined();
    expect(hits.get("/missing")).toBe(2); // checked once as a page, retried once

    const summary = r.findings
      .map(
        (f) =>
          `${f.type}|${f.severity}|${f.sourceUrl?.replace(/^http:\/\/[^/]+/, "") ?? ""}|${f.targetUrl?.replace(/^http:\/\/[^/]+/, "") ?? ""}`,
      )
      .sort();
    expect(summary).toEqual(
      [
        "broken_link|high|/|/missing",
        "broken_link|high|/about|/missing",
        "broken_link|medium|/|/gone",
        "redirect_loop|high|/|/loop-a",
        "redirect_chain|low|/|/chain1",
        "missing_title|medium|/about|",
        "missing_meta_description|low|/about|",
        "missing_canonical|low|/about|",
        "missing_h1|low|/about|",
      ].sort(),
    );
    expect(r.findings.some((f) => f.targetUrl?.endsWith("/flaky"))).toBe(false);
    expect(r).toMatchObject({ brokenInternal: 1, brokenExternal: 1, inconclusiveLinks: 1, skippedByRobots: 1 });
  });

  it("stops at the page budget and says so", async () => {
    const r = await crawlSite(`http://127.0.0.1:${port}/`, { ...limits, maxPages: 1 }, deps);
    expect(r).toMatchObject({ status: "partial", pagesVisited: 1 });
    expect(r.partialReasons).toContain("Page budget reached (1 page)");
  });

  it("stops at the request budget", async () => {
    const r = await crawlSite(`http://127.0.0.1:${port}/`, { ...limits, maxRequests: 4 }, deps);
    expect(r.status).toBe("partial");
    expect(r.requests).toBe(4);
    expect(r.partialReasons.join(" ")).toMatch(/Request budget reached/);
  });
});

async function localSite(ctx: TenantContext) {
  const site = await db.site.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: "Local",
      nameKey: "local",
      baseUrl: `http://127.0.0.1:${port}/`,
      normalizedHostname: "local.test",
      liveHostKey: "local.test",
    },
  });
  await db.siteState.create({ data: { siteId: site.id, workspaceId: ctx.workspaceId } });
  return site;
}

async function runQueuedAudits() {
  const runner = createRunner(db, {
    workerId: "audit-test",
    concurrency: 2,
    deps: {
      now: () => new Date(),
      fetch: { allowPrivate: true },
      sleep: async () => {},
      auditLimits: { delayMs: 0, retryDelayMs: 0 },
    },
  });
  await runner.claim();
  await runner.drain();
}

describe("audit jobs", () => {
  it("stores findings, keeps their first-found date, resolves fixed ones and manages the broken-link incident", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    await enqueue(db, [
      {
        workspaceId: ctx.workspaceId,
        jobType: "site_audit",
        resourceType: "site",
        resourceId: site.id,
        maxAttempts: 1,
      },
    ]);
    await runQueuedAudits();

    const run1 = await db.auditRun.findFirstOrThrow({ where: { siteId: site.id } });
    expect(run1).toMatchObject({ status: "completed", trigger: "scheduled", robots: "ok", pagesBudget: 1500 });
    const first = await openFindings(db, ctx, site.id);
    expect(first.total).toBe(9);
    expect(first.items[0].severity).toBe("high");
    const state1 = await db.siteState.findUniqueOrThrow({ where: { siteId: site.id } });
    expect(state1).toMatchObject({ lastAuditStatus: "completed", openFindings: 9, lastAuditRunId: run1.id });
    expect(state1.nextAuditAt.getTime()).toBeGreaterThan(Date.now()); // rescheduled
    expect(await db.incident.findFirstOrThrow({ where: { siteId: site.id } })).toMatchObject({
      type: "audit_issue",
      title: "1 confirmed broken link",
      status: "open",
    });
    const loopFinding = await db.auditFinding.findFirstOrThrow({ where: { siteId: site.id, type: "redirect_loop" } });

    missingFixed = true;
    hits = new Map();
    await enqueue(db, [
      {
        workspaceId: ctx.workspaceId,
        jobType: "site_audit",
        resourceType: "site",
        resourceId: site.id,
        maxAttempts: 1,
      },
    ]);
    await runQueuedAudits();

    const second = await openFindings(db, ctx, site.id);
    expect(second.total).toBe(7);
    expect(second.items.some((f) => f.targetUrl?.endsWith("/missing"))).toBe(false);
    const loopAgain = await db.auditFinding.findFirstOrThrow({
      where: { siteId: site.id, type: "redirect_loop", resolvedAt: null },
    });
    expect(loopAgain.id).toBe(loopFinding.id);
    expect(loopAgain.firstSeenAt.getTime()).toBe(loopFinding.firstSeenAt.getTime());
    expect(loopAgain.lastSeenAt.getTime()).toBeGreaterThan(loopFinding.lastSeenAt.getTime());
    expect(await db.incident.findFirstOrThrow({ where: { siteId: site.id } })).toMatchObject({ status: "resolved" });
  });

  it("a partial audit never resolves findings it didn't re-check", async () => {
    const ctx = await workspaceWithOwner();
    const site = await localSite(ctx);
    await enqueue(db, [
      {
        workspaceId: ctx.workspaceId,
        jobType: "site_audit",
        resourceType: "site",
        resourceId: site.id,
        maxAttempts: 1,
      },
    ]);
    await runQueuedAudits();
    expect((await openFindings(db, ctx, site.id)).total).toBe(9);

    // Same site, but the next run can only afford one page.
    const runner = createRunner(db, {
      workerId: "audit-test",
      concurrency: 2,
      deps: {
        now: () => new Date(),
        fetch: { allowPrivate: true },
        sleep: async () => {},
        auditLimits: { delayMs: 0, retryDelayMs: 0, maxPages: 1 },
      },
    });
    missingFixed = true;
    await enqueue(db, [
      {
        workspaceId: ctx.workspaceId,
        jobType: "site_audit",
        resourceType: "site",
        resourceId: site.id,
        maxAttempts: 1,
      },
    ]);
    await runner.claim();
    await runner.drain();
    const latest = await db.auditRun.findFirstOrThrow({ where: { siteId: site.id }, orderBy: { createdAt: "desc" } });
    expect(latest.status).toBe("partial");
    expect((await openFindings(db, ctx, site.id)).total).toBe(9); // /about's findings weren't re-checked, so they stay open
  });

  it("limits manual audits per week and refuses overlapping runs", async () => {
    const ctx = await workspaceWithOwner("Owner", "starter"); // 1 manual audit a week
    const site = await localSite(ctx);
    expect(await manualAuditAllowance(db, ctx)).toEqual({ allowed: 1, used: 0, left: 1 });
    await requestManualAudit(db, ctx, site.id);
    await expect(requestManualAudit(db, ctx, site.id)).rejects.toMatchObject({ code: "duplicate" });
    await runQueuedAudits();
    expect(await db.auditRun.findFirstOrThrow({ where: { siteId: site.id } })).toMatchObject({
      trigger: "manual",
      status: "completed",
    });
    await expect(requestManualAudit(db, ctx, site.id)).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("JavaScript-rendered detection", () => {
  it("flags an empty app shell but not a plain one-page site", async () => {
    const pages: Record<string, string> = {
      "/spa/": `<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>`,
      "/plain/": `<html><head><title>Example</title></head><body><p>This domain is for examples.</p><script src="/s.js"></script></body></html>`,
    };
    const fetchStub = async (url: string) => {
      const path = new URL(url).pathname;
      const body = pages[path] ?? "";
      return {
        finalUrl: url,
        status: body ? 200 : 404,
        redirects: 0,
        durationMs: 1,
        headers: { contentType: "text/html" },
        bodySnippet: body,
      };
    };
    const d = { fetch: fetchStub, clock: () => Date.now(), sleep: async () => {} };
    const spa = await crawlSite("http://example.test/spa/", { ...limits, respectRobots: false }, d);
    const plain = await crawlSite("http://example.test/plain/", { ...limits, respectRobots: false }, d);
    expect(spa.partialReasons).toContain("JavaScript-rendered pages — coverage incomplete");
    expect(plain.partialReasons).not.toContain("JavaScript-rendered pages — coverage incomplete");
  });
});
