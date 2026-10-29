"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { allowAccountEmail, allowSignIn, allowSignUp } from "@/lib/auth-limits";
import { logger } from "@/lib/log";
import { clientIp, withResolvedIp } from "@/lib/rate-limit";
import { emailSchema, nameSchema, passwordSchema, safeNextPath } from "@/lib/validation";

const log = logger("auth");

export type FormState = {
  fieldErrors?: Partial<Record<string, string>>;
  formError?: string;
  /** Echoed back so fields keep their values after a failed submit (never the password). */
  values?: Record<string, string>;
  done?: boolean;
};

function fieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

function errorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body = error.body as { code?: string } | undefined;
  return body?.code;
}

const signUpSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { name: raw.name, email: raw.email };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await allowSignUp(clientIp(await headers())))) {
    return { formError: "Too many sign-ups from this network. Try again in an hour.", values };
  }

  try {
    await auth.api.signUpEmail({
      body: { ...parsed.data, callbackURL: "/onboarding/workspace" },
      headers: withResolvedIp(await headers()),
    });
  } catch (error) {
    const code = errorCode(error);
    if (code?.startsWith("USER_ALREADY_EXISTS")) {
      return { fieldErrors: { email: "An account with this email already exists. Sign in instead." }, values };
    }
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      return { fieldErrors: { password: "Use between 12 and 128 characters." }, values };
    }
    log.error("sign-up failed", { code, error });
    return { formError: "We couldn’t create your account. Try again in a moment.", values };
  }
  redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
}

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
  const values = { email: raw.email };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await allowSignIn(clientIp(await headers()), parsed.data.email))) {
    return { formError: "Too many attempts. Wait 15 minutes and try again.", values };
  }

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: withResolvedIp(await headers()) });
  } catch (error) {
    const code = errorCode(error);
    if (code === "EMAIL_NOT_VERIFIED") redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
    if (code === "INVALID_EMAIL_OR_PASSWORD") return { formError: "Email or password is incorrect.", values };
    if (isAPIError(error) && error.status === "TOO_MANY_REQUESTS") {
      return { formError: "Too many attempts. Wait a minute and try again.", values };
    }
    log.error("sign-in failed", { code, error });
    return { formError: "We couldn’t sign you in. Try again in a moment.", values };
  }
  redirect(safeNextPath(formData.get("next")));
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { formError: "We don’t know which address to send to. Sign up again." };
  if (!(await allowAccountEmail("verify", parsed.data))) {
    return { formError: "We’ve sent several emails already. Check your spam folder, or try again in an hour." };
  }
  try {
    await auth.api.sendVerificationEmail({
      body: { email: parsed.data, callbackURL: "/onboarding/workspace" },
      headers: withResolvedIp(await headers()),
    });
  } catch (error) {
    // Don't reveal whether the address exists or is already verified.
    log.warn("resend verification failed", { code: errorCode(error) });
  }
  return { done: true };
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]?.message }, values: { email: raw } };
  // Over the limit we answer exactly as usual, so the response never reveals anything.
  if (!(await allowAccountEmail("reset", parsed.data))) return { done: true, values: { email: parsed.data } };
  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data, redirectTo: "/reset-password" },
      headers: withResolvedIp(await headers()),
    });
  } catch (error) {
    log.warn("password reset request failed", { code: errorCode(error) });
  }
  // Same response whether or not the account exists.
  return { done: true, values: { email: parsed.data } };
}

const resetSchema = z.object({ token: z.string().min(1), password: passwordSchema });

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors.token) return { formError: "This reset link is invalid. Request a new one." };
    return { fieldErrors: errors };
  }
  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
      headers: withResolvedIp(await headers()),
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === "INVALID_TOKEN")
      return { formError: "This reset link has expired or was already used. Request a new one." };
    log.error("password reset failed", { code, error });
    return { formError: "We couldn’t reset your password. Try again in a moment." };
  }
  redirect("/sign-in?reset=1");
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: withResolvedIp(await headers()) });
  } catch (error) {
    log.warn("sign-out failed", { code: errorCode(error) });
  }
  redirect("/sign-in");
}
