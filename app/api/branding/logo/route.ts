import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { apiMembership } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/data/workspace-tx";
import { deleteObject, putObject } from "@/lib/storage";

// Logo upload for report branding (design "Report branding"): PNG or SVG, ≤ 1 MB.
// Logos are only ever shown via <img>/data URIs, where SVG scripts don't run.

const MAX_BYTES = 1024 * 1024;

function kind(bytes: Buffer): "png" | "svg" | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  const head = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

export async function POST(req: NextRequest) {
  const member = await apiMembership(req.headers);
  if (!member) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (member.role === "member") return Response.json({ error: "Only admins can change branding." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PNG or SVG file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: `${file.name} is larger than 1 MB.` }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = kind(bytes);
  if (!type) return Response.json({ error: `${file.name} isn’t a PNG or SVG file.` }, { status: 400 });

  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: member.workspaceId },
    select: { logoStorageKey: true },
  });
  const key = `logos/${member.workspaceId}-${randomBytes(6).toString("hex")}.${type}`;
  await putObject(key, bytes);
  await db.workspace.update({ where: { id: member.workspaceId }, data: { logoStorageKey: key } });
  if (ws.logoStorageKey) await deleteObject(ws.logoStorageKey).catch(() => undefined);
  await recordAudit(db, member, "settings.logo_uploaded", "workspace", member.workspaceId);
  return Response.json({
    ok: true,
    dataUri: `data:${type === "svg" ? "image/svg+xml" : "image/png"};base64,${bytes.toString("base64")}`,
  });
}

export async function DELETE(req: NextRequest) {
  const member = await apiMembership(req.headers);
  if (!member) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (member.role === "member") return Response.json({ error: "Only admins can change branding." }, { status: 403 });
  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: member.workspaceId },
    select: { logoStorageKey: true },
  });
  await db.workspace.update({ where: { id: member.workspaceId }, data: { logoStorageKey: null } });
  if (ws.logoStorageKey) await deleteObject(ws.logoStorageKey).catch(() => undefined);
  return Response.json({ ok: true });
}
