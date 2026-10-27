import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedAddressError, guardedLookup, safeFetch } from "@/lib/monitoring/safe-fetch";

// Spec §13 security tests, at connection time: DNS rebinding, embedded IPv4 in
// IPv6 answers, hostile redirects and unbounded responses. The test server is
// on loopback, so "public" hostnames are mapped to it with a custom resolver.

let server: Server;
let port: number;
let handler: (path: string) => { status: number; location?: string; body?: string } = () => ({ status: 200 });

beforeAll(async () => {
  server = createServer((req, res) => {
    const r = handler(req.url ?? "/");
    res.writeHead(r.status, r.location ? { location: r.location } : {});
    res.end(r.body ?? "ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const lookupError = (resolver: Parameters<typeof guardedLookup>[0]) =>
  new Promise((resolve) => guardedLookup(resolver)("victim.example", {}, (e) => resolve(e)));

describe("SSRF at connection time", () => {
  it("re-resolves on every connection, so a rebinding answer is caught", async () => {
    let calls = 0;
    // First answer public (passes any early check), then the attacker's DNS flips to loopback.
    const rebinding = async () =>
      calls++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
    const lookup = guardedLookup(rebinding);
    await new Promise((resolve) => lookup("rebind.example", {}, (e) => resolve(e)));
    const second = await new Promise((resolve) => lookup("rebind.example", {}, (e) => resolve(e)));
    expect(second).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses IPv6 answers that embed private IPv4 addresses", async () => {
    for (const address of ["::ffff:7f00:1", "::ffff:127.0.0.1", "64:ff9b::a9fe:a9fe", "0:0:0:0:0:0:0:1", "fe80::1"]) {
      expect(await lookupError(async () => [{ address, family: 6 }]), address).toBeInstanceOf(BlockedAddressError);
    }
  });

  it("blocks a public name that resolves to loopback", async () => {
    const resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(safeFetch(`http://innocent.example:${port}/`, { timeoutMs: 2000, resolver })).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
  });

  it("refuses redirects to other schemes and stops after the redirect limit", async () => {
    handler = (path) => (path === "/file" ? { status: 302, location: "file:///etc/passwd" } : { status: 200 });
    await expect(
      safeFetch(`http://127.0.0.1:${port}/file`, { timeoutMs: 2000, allowPrivate: true }),
    ).rejects.toMatchObject({ kind: "invalid" });

    handler = (path) => {
      const n = Number(path.slice(1)) || 0;
      return { status: 302, location: `/${n + 1}` };
    };
    await expect(
      safeFetch(`http://127.0.0.1:${port}/0`, { timeoutMs: 2000, allowPrivate: true, maxRedirects: 5 }),
    ).rejects.toMatchObject({ kind: "too_many" });
  });

  it("reads at most maxBytes of a response body", async () => {
    handler = () => ({ status: 200, body: "x".repeat(500_000) });
    const res = await safeFetch(`http://127.0.0.1:${port}/big`, {
      timeoutMs: 2000,
      allowPrivate: true,
      maxBytes: 1024,
    });
    expect(res.bodySnippet.length).toBeLessThanOrEqual(1024);
  });
});
