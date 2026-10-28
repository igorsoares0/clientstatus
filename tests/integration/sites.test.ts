import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { archiveClient, createClient, getClient, listClients, restoreClient, updateClient } from "@/lib/data/clients";
import { UserFacingError } from "@/lib/data/errors";
import { commitImport, previewImport } from "@/lib/data/import";
import {
  archiveSite,
  createSite,
  getSite,
  listSites,
  pauseSites,
  recentSiteActivity,
  restoreSite,
  resumeSites,
  siteCounts,
  updateSiteSettings,
} from "@/lib/data/sites";
import { ForbiddenError } from "@/lib/data/tenant";
import { parseImportCsv } from "@/lib/csv";
import { PLANS, type PlanKey } from "@/lib/plans";
import { normalizeSiteUrl } from "@/lib/url";
import { addMember, db, resetDb, workspaceWithOwner } from "./helpers";

function url(raw: string) {
  const r = normalizeSiteUrl(raw);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

async function fillActive(ctx: Parameters<typeof createSite>[1], n: number, prefix = "s") {
  for (let i = 0; i < n; i++) await createSite(db, ctx, { url: url(`${prefix}${i}.example.com`) });
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("createSite", () => {
  it("stores the canonical URL, identity hostname and an audit entry", async () => {
    const ctx = await workspaceWithOwner();
    const site = await createSite(db, ctx, { url: url("https://www.Harbourdental.co.uk/") });
    const stored = await getSite(db, ctx, site.id);
    expect(stored).toMatchObject({
      name: "harbourdental.co.uk",
      baseUrl: "https://www.harbourdental.co.uk",
      normalizedHostname: "harbourdental.co.uk",
      registrableDomain: "harbourdental.co.uk",
      status: "active",
      timeoutMs: 10000,
      downPolicy: "server_errors",
    });
    expect(await db.auditLog.count({ where: { action: "site.created", resourceId: site.id } })).toBe(1);
  });

  it("rejects a second site with the same hostname, with or without www", async () => {
    const ctx = await workspaceWithOwner();
    await createSite(db, ctx, { url: url("harbourdental.co.uk") });
    await expect(createSite(db, ctx, { url: url("https://www.harbourdental.co.uk/book") })).rejects.toMatchObject({
      code: "duplicate",
      message: "harbourdental.co.uk is already monitored.",
    });
  });

  it("allows the same hostname in different workspaces", async () => {
    const a = await workspaceWithOwner("A");
    const b = await workspaceWithOwner("B");
    await createSite(db, a, { url: url("shared.example.com") });
    await expect(createSite(db, b, { url: url("shared.example.com") })).resolves.toBeDefined();
  });

  it("finds or creates a client by name; members can't create clients", async () => {
    const owner = await workspaceWithOwner();
    const site = await createSite(db, owner, { url: url("a.example.com"), clientName: "  Harbour   Dental " });
    const again = await createSite(db, owner, { url: url("b.example.com"), clientName: "harbour dental" });
    const [s1, s2] = await Promise.all([getSite(db, owner, site.id), getSite(db, owner, again.id)]);
    expect(s1.client?.name).toBe("Harbour Dental");
    expect(s1.client?.id).toBe(s2.client?.id);

    const member = await addMember(owner, "member");
    await expect(
      createSite(db, member, { url: url("c.example.com"), clientName: "New Client" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createSite(db, member, { url: url("c.example.com"), clientName: "harbour dental" }),
    ).resolves.toBeDefined();
  });

  it("refuses clients from another workspace", async () => {
    const a = await workspaceWithOwner("A");
    const b = await workspaceWithOwner("B");
    const foreign = await createClient(db, b, { name: "B's client" });
    await expect(createSite(db, a, { url: url("x.example.com"), clientId: foreign.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("plan limits (active sites only)", () => {
  it("blocks adding past the limit, counts paused sites as free, and limits resume", async () => {
    const ctx = await workspaceWithOwner("Owner", "starter"); // 15 active sites
    await fillActive(ctx, 15);
    await expect(createSite(db, ctx, { url: url("one-too-many.example.com") })).rejects.toMatchObject({
      code: "plan_limit",
      message: "Your plan is full (15 sites on Starter). Pause a site or upgrade your plan.",
    });

    const { items } = await listSites(db, ctx, { pageSize: 25 });
    const pausedIds = items.slice(0, 2).map((s) => s.id);
    expect((await pauseSites(db, ctx, pausedIds)).changed).toHaveLength(2);
    expect(await siteCounts(db, ctx)).toMatchObject({ active: 13, paused: 2 });

    await createSite(db, ctx, { url: url("fits-now.example.com") });
    await expect(resumeSites(db, ctx, pausedIds)).rejects.toMatchObject({ code: "plan_limit" });
    expect(await siteCounts(db, ctx)).toMatchObject({ active: 14, paused: 2 }); // all-or-nothing
    expect((await resumeSites(db, ctx, pausedIds.slice(0, 1))).changed).toHaveLength(1);
  });

  it("serialises concurrent adds so the last slot is only taken once", async () => {
    const ctx = await workspaceWithOwner("Owner", "starter");
    await fillActive(ctx, 14);
    const results = await Promise.allSettled([
      createSite(db, ctx, { url: url("race-a.example.com") }),
      createSite(db, ctx, { url: url("race-b.example.com") }),
      createSite(db, ctx, { url: url("race-c.example.com") }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await siteCounts(db, ctx)).active).toBe(15);
  });

  const limits: [PlanKey, number, RegExp][] = [
    ["starter", 15, /Pause a site or upgrade your plan\.$/],
    ["growth", 50, /Pause a site or upgrade your plan\.$/],
    // No add-on above the largest plan: the message points to us instead of an upgrade.
    ["pro", 150, /Pause a site or contact us about more than 150 sites\.$/],
  ];

  it.each(limits)("%s holds exactly %i active websites, added one by one or by CSV", async (planKey, max, hint) => {
    expect(PLANS[planKey].maxActiveSites).toBe(max);
    const ctx = await workspaceWithOwner("Owner", planKey);
    await fillActive(ctx, max - 1);

    const parsed = parseImportCsv("url\nlast-slot.example.com\nover.example.com");
    if (!parsed.ok) throw new Error(parsed.error);
    const preview = await previewImport(db, ctx, parsed.rows);
    expect(preview.map((r) => [r.kind, r.message])).toEqual([
      ["ok", "Ready"],
      ["err", `Over plan limit — ${max} sites on ${PLANS[planKey].name}`],
    ]);
    expect((await commitImport(db, ctx, parsed.rows)).imported).toBe(1);
    expect((await siteCounts(db, ctx)).active).toBe(max);

    const full = createSite(db, ctx, { url: url("one-too-many.example.com") });
    await expect(full).rejects.toMatchObject({ code: "plan_limit" });
    await expect(full).rejects.toThrow(hint);
  });
});

describe("pause, archive, restore", () => {
  it("skips sites that don't apply and never touches another workspace", async () => {
    const a = await workspaceWithOwner("A");
    const b = await workspaceWithOwner("B");
    const mine = await createSite(db, a, { url: url("mine.example.com") });
    const theirs = await createSite(db, b, { url: url("theirs.example.com") });
    const result = await pauseSites(db, a, [mine.id, theirs.id]);
    expect(result).toEqual({ changed: [mine.id], skipped: 1 });
    expect((await getSite(db, b, theirs.id)).status).toBe("active");
    expect((await getSite(db, a, mine.id)).pausedBy?.name).toBe("A");
  });

  it("frees the hostname on archive and re-checks limits on restore", async () => {
    const ctx = await workspaceWithOwner();
    const old = await createSite(db, ctx, { url: url("again.example.com") });
    await archiveSite(db, ctx, old.id);
    expect((await listSites(db, ctx, {})).total).toBe(0);
    expect((await listSites(db, ctx, { status: "archived" })).total).toBe(1);

    const fresh = await createSite(db, ctx, { url: url("again.example.com") });
    await expect(restoreSite(db, ctx, old.id)).rejects.toMatchObject({ code: "duplicate" });
    await archiveSite(db, ctx, fresh.id);
    await restoreSite(db, ctx, old.id);
    expect((await getSite(db, ctx, old.id)).status).toBe("active");
  });

  it("validates settings and keeps them inside the workspace", async () => {
    const a = await workspaceWithOwner("A");
    const b = await workspaceWithOwner("B");
    const site = await createSite(db, a, { url: url("s.example.com") });
    await updateSiteSettings(db, a, site.id, {
      name: "Shop",
      clientId: null,
      timeoutMs: 15000,
      downPolicy: "non_success",
    });
    expect(await getSite(db, a, site.id)).toMatchObject({ name: "Shop", timeoutMs: 15000, downPolicy: "non_success" });
    await expect(
      updateSiteSettings(db, a, site.id, { name: "x", clientId: null, timeoutMs: 999, downPolicy: "server_errors" }),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      updateSiteSettings(db, b, site.id, { name: "x", clientId: null, timeoutMs: 10000, downPolicy: "server_errors" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listSites", () => {
  it("searches name, hostname and client, filters and paginates", async () => {
    const ctx = await workspaceWithOwner();
    const harbour = await createClient(db, ctx, { name: "Harbour Dental" });
    await createSite(db, ctx, { url: url("harbourdental.co.uk"), clientId: harbour.id });
    await createSite(db, ctx, { url: url("kiln-coffee.com"), name: "Kiln Coffee" });
    await fillActive(ctx, 30, "bulk");

    expect((await listSites(db, ctx, { q: "harbour" })).total).toBe(1);
    expect((await listSites(db, ctx, { q: "KILN" })).items[0].name).toBe("Kiln Coffee");
    expect((await listSites(db, ctx, { q: "dental" })).total).toBe(1);
    expect((await listSites(db, ctx, { clientId: harbour.id })).total).toBe(1);
    expect((await listSites(db, ctx, { clientId: "unassigned" })).total).toBe(31);

    const page2 = await listSites(db, ctx, { page: 2, pageSize: 25, sort: "name" });
    expect(page2).toMatchObject({ total: 32, page: 2, pageCount: 2 });
    expect(page2.items).toHaveLength(7);
    expect((await listSites(db, ctx, { page: 99 })).page).toBe(2);
  });
});

describe("sorting and activity", () => {
  it("sorts names case-insensitively and lists CSV imports as activity", async () => {
    const ctx = await workspaceWithOwner();
    await createSite(db, ctx, { url: url("v.example.com"), name: "Vela Events" });
    await createSite(db, ctx, { url: url("h.example.com"), name: "harbourdental.co.uk" });
    await createSite(db, ctx, { url: url("a.example.com"), name: "Ashby" });
    const names = (await listSites(db, ctx, { sort: "name" })).items.map((s) => s.name);
    expect(names).toEqual(["Ashby", "harbourdental.co.uk", "Vela Events"]);

    const parsed = parseImportCsv("url\nimported-1.example.com\nimported-2.example.com");
    if (!parsed.ok) throw new Error(parsed.error);
    await commitImport(db, ctx, parsed.rows);
    const activity = await recentSiteActivity(db, ctx);
    expect(activity[0]).toMatchObject({ action: "sites.imported", label: "2 websites from CSV" });
  });
});

describe("clients", () => {
  it("requires Admin to manage clients and rejects duplicate names", async () => {
    const owner = await workspaceWithOwner();
    const member = await addMember(owner, "member");
    await expect(createClient(db, member, { name: "Nope" })).rejects.toBeInstanceOf(ForbiddenError);
    const c = await createClient(db, owner, { name: "Harbour Dental", contactEmail: "pm@harbour.example" });
    await expect(createClient(db, owner, { name: " harbour  dental " })).rejects.toMatchObject({ code: "duplicate" });
    await createClient(db, owner, { name: "Kiln" });
    await expect(updateClient(db, owner, c.id, { name: "KILN" })).rejects.toMatchObject({ code: "duplicate" });
  });

  it("archives with websites unassigned or paused, keeps history, and restores", async () => {
    const ctx = await workspaceWithOwner();
    const c1 = await createClient(db, ctx, { name: "Keep" });
    const c2 = await createClient(db, ctx, { name: "Pause" });
    const s1 = await createSite(db, ctx, { url: url("keep.example.com"), clientId: c1.id });
    const s2 = await createSite(db, ctx, { url: url("pause.example.com"), clientId: c2.id });

    await archiveClient(db, ctx, c1.id, "unassign");
    await archiveClient(db, ctx, c2.id, "pause");
    expect(await getSite(db, ctx, s1.id)).toMatchObject({ status: "active", client: null });
    expect(await getSite(db, ctx, s2.id)).toMatchObject({ status: "paused", client: { id: c2.id } });
    expect((await listClients(db, ctx, { tab: "archived" })).map((c) => c.name).sort()).toEqual(["Keep", "Pause"]);
    expect((await getClient(db, ctx, c2.id)).status).toBe("archived");

    await expect(createSite(db, ctx, { url: url("x.example.com"), clientId: c2.id })).rejects.toMatchObject({
      code: "invalid",
    });
    await restoreClient(db, ctx, c2.id);
    expect((await listClients(db, ctx, { tab: "active" })).map((c) => c.name)).toEqual(["Pause"]);
  });

  it("searches clients by contact and website hostname", async () => {
    const ctx = await workspaceWithOwner();
    const c = await createClient(db, ctx, { name: "Harbour", contactName: "Dr Jane Lee" });
    await createSite(db, ctx, { url: url("harbourdental.co.uk"), clientId: c.id });
    await createClient(db, ctx, { name: "Other" });
    expect((await listClients(db, ctx, { tab: "active", q: "jane" })).map((x) => x.name)).toEqual(["Harbour"]);
    expect((await listClients(db, ctx, { tab: "active", q: "harbourdental" })).map((x) => x.name)).toEqual(["Harbour"]);
    expect((await listClients(db, ctx, { tab: "active" }))[0]).toMatchObject({ activeSites: 1, pausedSites: 0 });
  });
});

describe("CSV import", () => {
  const csv = `url,name,client
harbourdental.co.uk,Harbour Dental Group,Harbour Dental Group
https://shop.kiln-coffee.com,Kiln Coffee Shop,Unknown Client
ftp://files.example.com,File server,
192.168.1.20,Staging,
https://www.harbourdental.co.uk/book,Harbour booking,
already.example.com,Existing,
http://plain.example.com,,
,Missing url,`;

  it("previews every row with its outcome and imports only ready rows", async () => {
    const ctx = await workspaceWithOwner();
    await createClient(db, ctx, { name: "Harbour Dental Group" });
    await createSite(db, ctx, { url: url("already.example.com") });
    const parsed = parseImportCsv(csv);
    if (!parsed.ok) throw new Error(parsed.error);

    const preview = await previewImport(db, ctx, parsed.rows);
    expect(preview.map((r) => [r.line, r.kind, r.message])).toEqual([
      [2, "ok", "Ready"],
      [3, "warn", "Ready · client “Unknown Client” not found → Unassigned"],
      [4, "err", "ftp:// isn’t supported — http or https only"],
      [5, "err", "Private or local address — blocked for safety"],
      [6, "err", "Duplicate of row 2"],
      [7, "err", "Already monitored"],
      [8, "ok", "Ready · http only, no SSL check"],
      [9, "err", "URL is required"],
    ]);
    expect(await siteCounts(db, ctx)).toMatchObject({ active: 1 }); // preview adds nothing

    const result = await commitImport(db, ctx, parsed.rows);
    expect(result.imported).toBe(3);
    expect(await siteCounts(db, ctx)).toMatchObject({ active: 4 });
    const { items } = await listSites(db, ctx, { q: "harbourdental" });
    expect(items[0]).toMatchObject({ name: "Harbour Dental Group", client: { name: "Harbour Dental Group" } });
    expect((await listSites(db, ctx, { q: "plain" })).items[0].name).toBe("plain.example.com");
  });

  it("marks rows over the plan limit and re-checks on commit", async () => {
    const ctx = await workspaceWithOwner("Owner", "starter");
    await fillActive(ctx, 14);
    const parsed = parseImportCsv("url\nfirst.example.com\nsecond.example.com");
    if (!parsed.ok) throw new Error(parsed.error);
    const preview = await previewImport(db, ctx, parsed.rows);
    expect(preview.map((r) => r.kind)).toEqual(["ok", "err"]);
    expect(preview[1].message).toBe("Over plan limit — 15 sites on Starter");

    // Someone takes the last slot between preview and commit.
    await createSite(db, ctx, { url: url("sneaky.example.com") });
    const result = await commitImport(db, ctx, parsed.rows);
    expect(result.imported).toBe(0);
    expect((await siteCounts(db, ctx)).active).toBe(15);
  });
});
