/**
 * An expected failure whose message is safe and useful to show the user
 * (duplicate, plan limit, not found). Anything else is a bug and gets a
 * generic message plus a log entry.
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "duplicate" | "plan_limit" | "invalid" | "forbidden" | "rate_limited",
    readonly field?: string,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

export const notFound = (what: string) =>
  new UserFacingError(`That ${what} doesn’t exist or was removed.`, "not_found");
