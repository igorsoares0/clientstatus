import { allow } from "@/lib/rate-limit";

// Rate limits for the auth server actions (spec §8.2 "rate-limit login"). The
// actions call Better Auth in-process, which skips its HTTP rate limiter, so
// they check here first. In-process, like lib/rate-limit.ts.

const MIN = 60_000;

export function allowSignIn(ip: string, email: string, now = Date.now()): boolean {
  const address = email.trim().toLowerCase();
  // Per address and IP (guessing one account), per IP (spraying many), and per address
  // alone — the IP comes from X-Forwarded-For, which only a trusted proxy makes reliable.
  return (
    allow(`signin:${ip}:${address}`, 10, 15 * MIN, now) &&
    allow(`signin-ip:${ip}`, 50, 15 * MIN, now) &&
    allow(`signin-addr:${address}`, 30, 15 * MIN, now)
  );
}

export function allowSignUp(ip: string, now = Date.now()): boolean {
  return allow(`signup:${ip}`, 20, 60 * MIN, now);
}

/** Password reset and verification resends: per address, so nobody can flood someone's inbox. */
export function allowAccountEmail(kind: "reset" | "verify", email: string, now = Date.now()): boolean {
  return allow(`${kind}:${email.trim().toLowerCase()}`, 5, 60 * MIN, now);
}
