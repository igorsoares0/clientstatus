import { env } from "@/lib/env";

// Private beta (spec §15 Phase 5): when SIGNUP_ALLOWLIST is set, only listed
// emails ("ana@agency.com") or domains ("@agency.com") can create accounts.

export const SIGNUP_CLOSED_MESSAGE =
  "Client Status is in private beta. Ask us for an invitation and we’ll add your address.";

export function isSignupAllowed(email: string, list = env().SIGNUP_ALLOWLIST): boolean {
  if (!list) return true;
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@"));
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}
