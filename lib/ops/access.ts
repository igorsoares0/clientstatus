import { env } from "@/lib/env";

/** Internal ops access is an explicit email allowlist (OPS_ADMIN_EMAILS); empty means nobody. */
export function isOpsAdmin(email: string, list = env().OPS_ADMIN_EMAILS): boolean {
  if (!list) return false;
  const allowed = list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
