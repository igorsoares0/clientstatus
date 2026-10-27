"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { isHexColor, normalizeHex } from "@/lib/color";
import { db } from "@/lib/db";
import { updateBranding, updateNotificationSettings } from "@/lib/data/reports";
import { eventsSchema, getNotificationSettings, LINK_EXPIRY_OPTIONS, REPEAT_OPTIONS } from "@/lib/notify/settings";
import { requireMembership } from "@/lib/session";

const alertsSchema = z.object({
  recipientUserIds: z.array(z.string()).max(50),
  events: eventsSchema,
  repeatMinutes: z.number().refine((v) => (REPEAT_OPTIONS as readonly number[]).includes(v)),
});

export async function saveAlertsAction(input: z.infer<typeof alertsSchema>): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = alertsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the alert settings." };
  try {
    const current = await getNotificationSettings(db, ctx.workspaceId);
    await updateNotificationSettings(db, ctx, {
      ...parsed.data,
      reportDelivery: current.reportDelivery,
      linkExpiryDays: current.linkExpiryDays,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "save alert settings");
  }
}

const scheduleSchema = z.object({
  reportDelivery: z.enum(["review", "auto"]),
  linkExpiryDays: z.number().refine((v) => (LINK_EXPIRY_OPTIONS as readonly number[]).includes(v)),
});

export async function saveScheduleAction(input: z.infer<typeof scheduleSchema>): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the schedule settings." };
  try {
    const current = await getNotificationSettings(db, ctx.workspaceId);
    await updateNotificationSettings(db, ctx, {
      recipientUserIds: current.recipientUserIds,
      events: current.events,
      repeatMinutes: current.repeatMinutes,
      ...parsed.data,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "save schedule");
  }
}

const brandingSchema = z.object({
  name: z.string().trim().min(1, "Enter your agency’s name.").max(80, "Keep it under 80 characters."),
  color: z
    .string()
    .trim()
    .refine((v) => v === "" || isHexColor(v), "Use a hex colour like #23395B."),
  contact: z.string().trim().max(120, "Keep it under 120 characters."),
  footer: z.string().trim().max(90, "Keep the footer under 90 characters."),
});

export async function saveBrandingAction(input: z.infer<typeof brandingSchema>): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the branding settings." };
  try {
    await updateBranding(db, ctx, {
      name: parsed.data.name,
      color: parsed.data.color ? normalizeHex(parsed.data.color) : null,
      contact: parsed.data.contact || null,
      footer: parsed.data.footer || null,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "save branding");
  }
}
