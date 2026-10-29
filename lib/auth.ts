import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { actionEmail, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { betterAuthRateLimitStorage, RESOLVED_IP_HEADER } from "@/lib/rate-limit";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation";

const VERIFICATION_TTL_SECONDS = 24 * 60 * 60; // Onboarding copy: "valid for 24 hours"

export const auth = betterAuth({
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Client Status password",
        idempotencyKey: `password-reset/${token}`,
        ...actionEmail({
          heading: "Reset your password",
          body: "Someone asked to reset the password for this Client Status account. The link works once and expires in 1 hour.",
          actionLabel: "Choose a new password",
          url,
          footer: "If this wasn’t you, ignore this email — your password stays the same.",
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_TTL_SECONDS,
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email for Client Status",
        idempotencyKey: `verify-email/${token.slice(-48)}`,
        ...actionEmail({
          heading: "Confirm your email address",
          body: "Alert emails will go to this address, so we need to know it works. The link is valid for 24 hours.",
          actionLabel: "Confirm email",
          url,
          footer: "If you didn’t create a Client Status account, you can ignore this email.",
        }),
      });
    },
  },
  // Direct HTTP calls to the auth API (spec §8.2). Server actions add their own limits (lib/auth-limits.ts).
  // Counters are shared with the app's limiter in Postgres, so they hold across web instances.
  rateLimit: {
    enabled: env().NODE_ENV === "production",
    customStorage: betterAuthRateLimitStorage(),
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 20 },
      "/request-password-reset": { window: 3600, max: 10 },
      "/send-verification-email": { window: 3600, max: 10 },
    },
  },
  // The client address comes only from the header we set after resolving the proxy chain
  // (app/api/auth/[...all]/route.ts, lib/rate-limit.ts), never from raw X-Forwarded-For.
  advanced: { ipAddress: { ipAddressHeaders: [RESOLVED_IP_HEADER] } },
  // Must stay last so Set-Cookie works from Server Actions.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
