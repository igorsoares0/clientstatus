import { allow, defaultStore, type RateLimitStore } from "@/lib/rate-limit";

// Rate limits for the auth server actions (spec §8.2 "rate-limit login"). The
// actions call Better Auth in-process, which skips its HTTP rate limiter, so
// they check here first. Shared across instances, like lib/rate-limit.ts.

const MIN = 60_000;

export async function allowSignIn(
  ip: string,
  email: string,
  now = Date.now(),
  store: RateLimitStore = defaultStore(),
): Promise<boolean> {
  const address = email.trim().toLowerCase();
  // Per address and IP (guessing one account), per IP (spraying many), and per address alone.
  // Every counter is hit, so a blocked attempt still counts against the others.
  const results = await Promise.all([
    allow(`signin:${ip}:${address}`, 10, 15 * MIN, now, store),
    allow(`signin-ip:${ip}`, 50, 15 * MIN, now, store),
    allow(`signin-addr:${address}`, 30, 15 * MIN, now, store),
  ]);
  return results.every(Boolean);
}

export async function allowSignUp(ip: string, now = Date.now(), store: RateLimitStore = defaultStore()) {
  return allow(`signup:${ip}`, 20, 60 * MIN, now, store);
}

/** Password reset and verification resends: per address, so nobody can flood someone's inbox. */
export async function allowAccountEmail(
  kind: "reset" | "verify",
  email: string,
  now = Date.now(),
  store: RateLimitStore = defaultStore(),
) {
  return allow(`${kind}:${email.trim().toLowerCase()}`, 5, 60 * MIN, now, store);
}
