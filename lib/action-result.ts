import { UserFacingError } from "@/lib/data/errors";
import { ForbiddenError } from "@/lib/data/tenant";
import { logger } from "@/lib/log";

const log = logger("action");

export type ActionError = { ok: false; error: string; field?: string };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionError;

/** Turns expected failures into messages; logs and hides everything else. */
export function toActionError(error: unknown, context: string): ActionError {
  if (error instanceof UserFacingError) return { ok: false, error: error.message, field: error.field };
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  log.error(`${context} failed`, { error });
  return { ok: false, error: "Something went wrong. Try again in a moment." };
}
