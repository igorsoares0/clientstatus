"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { parseImportCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { commitImport, previewImport, type EvaluatedRow } from "@/lib/data/import";
import {
  archiveSite,
  createSite,
  pauseSites,
  restoreSite,
  resumeSites,
  TIMEOUT_OPTIONS_MS,
  updateSiteSettings,
} from "@/lib/data/sites";
import { requestManualAudit } from "@/lib/data/audits";
import { requestManualCheck } from "@/lib/data/monitoring";
import { logger } from "@/lib/log";
import { warnIfNearPlanLimit } from "@/lib/notify/usage";
import { requireMembership } from "@/lib/session";
import { normalizeSiteUrl } from "@/lib/url";

const log = logger("websites");

const idList = z.array(z.uuid()).min(1).max(500);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((v) => v || undefined);

/** The 90%-of-plan email goes out after the response, so a slow mail queue never delays the action. */
function afterAddingSites(workspaceId: string) {
  after(() =>
    warnIfNearPlanLimit(db, workspaceId).catch((error) => log.error("usage warning failed", { workspaceId, error })),
  );
}

export type AddSiteState = ActionResult<{ siteId: string; hostname: string }> | null;

const addSchema = z.object({
  url: z.string(),
  name: optionalText(120),
  clientId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  clientName: optionalText(120),
});

export async function addSiteAction(_prev: AddSiteState, formData: FormData): Promise<AddSiteState> {
  const ctx = await requireMembership();
  const parsed = addSchema.safeParse({
    url: String(formData.get("url") ?? ""),
    name: String(formData.get("name") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    clientName: String(formData.get("clientName") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const url = normalizeSiteUrl(parsed.data.url);
  if (!url.ok) return { ok: false, error: `${url.error}.`, field: "url" };

  try {
    const site = await createSite(db, ctx, {
      url: url.value,
      name: parsed.data.name,
      clientId: parsed.data.clientId,
      clientName: parsed.data.clientName,
    });
    afterAddingSites(ctx.workspaceId);
    refresh();
    return { ok: true, siteId: site.id, hostname: site.normalizedHostname };
  } catch (error) {
    return toActionError(error, "add site");
  }
}

export type BulkState = ActionResult<{ changed: string[]; skipped: number }>;

export async function setSitesPausedAction(siteIds: string[], paused: boolean): Promise<BulkState> {
  const ctx = await requireMembership();
  const ids = idList.safeParse(siteIds);
  if (!ids.success) return { ok: false, error: "Select at least one website." };
  try {
    const result = paused ? await pauseSites(db, ctx, ids.data) : await resumeSites(db, ctx, ids.data);
    if (!paused) afterAddingSites(ctx.workspaceId);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return toActionError(error, paused ? "pause sites" : "resume sites");
  }
}

export type SettingsState = ActionResult | null;

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Enter a display name.").max(120, "Keep it under 120 characters."),
  clientId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  timeoutMs: z.coerce.number().refine((v) => (TIMEOUT_OPTIONS_MS as readonly number[]).includes(v)),
  downPolicy: z.enum(["server_errors", "non_success"]),
  respectRobots: z.enum(["on", "off"]).default("off"),
  alertsEnabled: z.enum(["on", "off"]).default("off"),
});

export async function updateSiteSettingsAction(
  siteId: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await requireMembership();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const { respectRobots, alertsEnabled, ...settings } = parsed.data;
    await updateSiteSettings(db, ctx, siteId, {
      ...settings,
      respectRobots: respectRobots === "on",
      alertsEnabled: alertsEnabled === "on",
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "update site");
  }
}

export async function archiveSiteAction(siteId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    await archiveSite(db, ctx, siteId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "archive site");
  }
}

export async function restoreSiteAction(siteId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    await restoreSite(db, ctx, siteId);
    afterAddingSites(ctx.workspaceId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "restore site");
  }
}

export type ImportPreview = ActionResult<{ rows: EvaluatedRow[] }>;

export async function previewImportAction(csvText: string): Promise<ImportPreview> {
  const ctx = await requireMembership();
  const parsed = parseImportCsv(String(csvText));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    return { ok: true, rows: await previewImport(db, ctx, parsed.rows) };
  } catch (error) {
    return toActionError(error, "preview import");
  }
}

export type ImportCommit = ActionResult<{ imported: number; rows: EvaluatedRow[] }>;

export async function commitImportAction(csvText: string): Promise<ImportCommit> {
  const ctx = await requireMembership();
  const parsed = parseImportCsv(String(csvText));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const result = await commitImport(db, ctx, parsed.rows);
    afterAddingSites(ctx.workspaceId);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return toActionError(error, "import sites");
  }
}

export async function runCheckNowAction(siteId: string): Promise<ActionResult<{ queued: boolean }>> {
  const ctx = await requireMembership();
  try {
    const result = await requestManualCheck(db, ctx, siteId);
    return { ok: true, ...result };
  } catch (error) {
    return toActionError(error, "run check now");
  }
}

export async function runAuditNowAction(siteId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    await requestManualAudit(db, ctx, siteId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "run audit now");
  }
}
