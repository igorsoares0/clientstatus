"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { AlreadyInWorkspaceError, createWorkspaceForUser } from "@/lib/data/workspace";
import { logger } from "@/lib/log";
import { requireUser } from "@/lib/session";
import { timezoneSchema, workspaceNameSchema } from "@/lib/validation";

const log = logger("onboarding");

export type WorkspaceFormState = {
  fieldErrors?: { name?: string; timezone?: string };
  formError?: string;
  values?: { name: string; timezone: string };
};

const schema = z.object({ name: workspaceNameSchema, timezone: timezoneSchema });

export async function createWorkspaceAction(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const user = await requireUser();
  const values = { name: String(formData.get("name") ?? ""), timezone: String(formData.get("timezone") ?? "") };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: WorkspaceFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "timezone";
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  try {
    await createWorkspaceForUser(db, user.id, parsed.data);
  } catch (error) {
    if (!(error instanceof AlreadyInWorkspaceError)) {
      log.error("workspace creation failed", { error });
      return { formError: "We couldn’t create the workspace. Try again in a moment.", values };
    }
    // Double submit or second tab: the workspace already exists, carry on.
  }
  redirect("/onboarding/website");
}
