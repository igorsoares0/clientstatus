"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { archiveClient, createClient, restoreClient, updateClient, updateClientNotes } from "@/lib/data/clients";
import { removeRecipient } from "@/lib/data/reports";
import { requireMembership } from "@/lib/session";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter a client name.").max(120, "Keep the name under 120 characters."),
  contactName: z.string().trim().max(120, "Keep the contact name under 120 characters."),
  contactEmail: z.union([z.literal(""), z.email("Contact email isn’t valid.").max(254)]),
});

function parseClient(formData: FormData) {
  return clientSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
  });
}

export type ClientFormState = ActionResult<{ clientId: string }> | null;

export async function createClientAction(formData: FormData): Promise<ClientFormState> {
  const ctx = await requireMembership();
  const parsed = parseClient(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const client = await createClient(db, ctx, parsed.data);
    refresh();
    return { ok: true, clientId: client.id };
  } catch (error) {
    return toActionError(error, "create client");
  }
}

export async function updateClientAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = parseClient(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    await updateClient(db, ctx, clientId, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "update client");
  }
}

export async function updateClientNotesAction(clientId: string, notes: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  const parsed = z.string().max(5000, "Keep notes under 5,000 characters.").safeParse(notes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the notes." };
  try {
    await updateClientNotes(db, ctx, clientId, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "update client notes");
  }
}

export async function archiveClientAction(clientId: string, mode: "unassign" | "pause"): Promise<ActionResult> {
  const ctx = await requireMembership();
  if (mode !== "unassign" && mode !== "pause") return { ok: false, error: "Choose what happens to its websites." };
  try {
    await archiveClient(db, ctx, clientId, mode);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "archive client");
  }
}

export async function restoreClientAction(clientId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    await restoreClient(db, ctx, clientId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "restore client");
  }
}

export async function removeRecipientAction(recipientId: string): Promise<ActionResult> {
  const ctx = await requireMembership();
  try {
    await removeRecipient(db, ctx, recipientId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error, "remove recipient");
  }
}
