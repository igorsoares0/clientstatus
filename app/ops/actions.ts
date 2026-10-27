"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { requeueFailedJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/log";
import { isOpsAdmin } from "@/lib/ops/access";
import { requireUser } from "@/lib/session";

const log = logger("ops");

const MESSAGES = {
  not_failed: "That job isn’t in the failed state any more.",
  busy: "The same work is already queued or running.",
} as const;

export async function requeueJobAction(jobId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isOpsAdmin(user.email)) notFound();
  if (!z.uuid().safeParse(jobId).success) return { ok: false, error: "That job id isn’t valid." };
  const result = await requeueFailedJob(db, jobId);
  // Access auditing (FR-OPS-06): every ops action is logged with who did it.
  log.info("job requeued by ops", { jobId, result, actor: user.email });
  if (result !== "requeued") return { ok: false, error: MESSAGES[result] };
  refresh();
  return { ok: true };
}
