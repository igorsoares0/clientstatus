"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import {
  acknowledgeIncident,
  addIncidentNote,
  muteIncident,
  reopenAcknowledged,
  unmuteIncident,
} from "@/lib/data/incidents";
import { requireMembership } from "@/lib/session";

const ACTIONS = {
  acknowledge: acknowledgeIncident,
  mute: muteIncident,
  unmute: unmuteIncident,
  unacknowledge: reopenAcknowledged,
} as const;

export type IncidentAction = keyof typeof ACTIONS;

export async function incidentAction(incidentId: string, action: IncidentAction): Promise<ActionResult> {
  const ctx = await requireMembership();
  const fn = ACTIONS[action];
  if (!fn) return { ok: false, error: "Unknown action." };
  try {
    await fn(db, ctx, incidentId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, `incident ${action}`);
  }
}

export async function addIncidentNoteAction(incidentId: string, note: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = z.string().max(2000, "Keep notes under 2,000 characters.").safeParse(note);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the note." };
  try {
    await addIncidentNote(db, ctx, incidentId, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "add incident note");
  }
}
