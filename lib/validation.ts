import { z } from "zod";

// Shared form rules. Used by server actions (authoritative) and client forms
// (live hints only), so copy matches the Onboarding design exactly.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const nameSchema = z.string().trim().min(1, "Enter your name.").max(100, "Keep it under 100 characters.");
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));
export const passwordSchema = z
  .string()
  .min(1, "Choose a password.")
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Keep it under ${PASSWORD_MAX} characters.`);

/** Live hint under the password field, e.g. "3 more characters needed." */
export function passwordHint(pw: string, tried: boolean): { text: string; tone: "muted" | "error" | "ok" } {
  if (pw.length === 0)
    return tried
      ? { text: "Choose a password.", tone: "error" }
      : { text: `At least ${PASSWORD_MIN} characters.`, tone: "muted" };
  if (pw.length < PASSWORD_MIN) {
    const n = PASSWORD_MIN - pw.length;
    return { text: `${n} more character${n === 1 ? "" : "s"} needed.`, tone: tried ? "error" : "muted" };
  }
  if (pw.length > PASSWORD_MAX) return { text: `Keep it under ${PASSWORD_MAX} characters.`, tone: "error" };
  return { text: "✓ Long enough", tone: "ok" };
}

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your agency’s name.")
  .max(80, "Keep it under 80 characters.");

export function isValidTimezone(tz: string): boolean {
  // The constructor throws RangeError for unknown zones and accepts aliases
  // (e.g. Asia/Calcutta) that browsers may report but supportedValuesOf omits.
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().refine(isValidTimezone, "Choose a valid timezone.");

/** URL-safe slug from a workspace name; uniqueness is handled by the caller. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}
