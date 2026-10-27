import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { assertRole, ForbiddenError, type TenantContext } from "@/lib/data/tenant";
import { contextFor, createUser, db, resetDb } from "./helpers";
import {
  AlreadyInWorkspaceError,
  countMembers,
  createWorkspaceForUser,
  listAuditLog,
  listMembers,
} from "@/lib/data/workspace";

// Tenant isolation against a real Postgres (FR-AUTH-03/06, spec §13 "Database tenant isolation").

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("createWorkspaceForUser", () => {
  it("creates the workspace, an owner membership and an audit entry on a Growth trial", async () => {
    const user = await createUser("Priya");
    const now = new Date("2026-10-25T09:48:00Z");
    const { workspaceId } = await createWorkspaceForUser(
      db,
      user.id,
      { name: "Northfold Studio", timezone: "Europe/London" },
      now,
    );

    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(workspace).toMatchObject({
      name: "Northfold Studio",
      slug: "northfold-studio",
      timezone: "Europe/London",
      planKey: "growth",
    });
    expect(workspace.trialEndsAt?.toISOString()).toBe("2026-11-08T09:48:00.000Z");

    const ctx = await contextFor(user.id);
    expect(ctx.role).toBe("owner");
    const log = await listAuditLog(db, ctx);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "workspace.created", resourceId: workspaceId, actorUserId: user.id });
  });

  it("gives colliding names distinct slugs", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    await createWorkspaceForUser(db, a.id, { name: "Northfold Studio", timezone: "UTC" });
    const { workspaceId } = await createWorkspaceForUser(db, b.id, { name: "Northfold Studio", timezone: "UTC" });
    const second = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(second.slug).toMatch(/^northfold-studio-[0-9a-f]{6}$/);
  });

  it("refuses a second workspace for the same account (one workspace per account in v1)", async () => {
    const user = await createUser("Priya");
    await createWorkspaceForUser(db, user.id, { name: "First", timezone: "UTC" });
    await expect(createWorkspaceForUser(db, user.id, { name: "Second", timezone: "UTC" })).rejects.toBeInstanceOf(
      AlreadyInWorkspaceError,
    );
    expect(await db.workspace.count()).toBe(1);
  });
});

describe("tenant isolation", () => {
  it("never returns another workspace's members or audit log", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    await createWorkspaceForUser(db, alice.id, { name: "Alice Agency", timezone: "UTC" });
    await createWorkspaceForUser(db, bob.id, { name: "Bob Agency", timezone: "UTC" });
    const aliceCtx = await contextFor(alice.id);
    const bobCtx = await contextFor(bob.id);

    const aliceMembers = await listMembers(db, aliceCtx);
    expect(aliceMembers.map((m) => m.user.id)).toEqual([alice.id]);
    expect(await countMembers(db, aliceCtx)).toBe(1);

    const aliceLog = await listAuditLog(db, aliceCtx);
    expect(aliceLog.every((e) => e.resourceId === aliceCtx.workspaceId)).toBe(true);

    const bobMembers = await listMembers(db, bobCtx);
    expect(bobMembers.map((m) => m.user.id)).toEqual([bob.id]);
  });
});

describe("assertRole", () => {
  const ctx = (role: TenantContext["role"]): TenantContext => ({ userId: "u", workspaceId: "w", role });

  it("allows equal or higher roles", () => {
    expect(() => assertRole(ctx("owner"), "admin")).not.toThrow();
    expect(() => assertRole(ctx("admin"), "admin")).not.toThrow();
  });

  it("rejects lower roles", () => {
    expect(() => assertRole(ctx("member"), "admin")).toThrow(ForbiddenError);
    expect(() => assertRole(ctx("admin"), "owner")).toThrow(ForbiddenError);
  });
});
