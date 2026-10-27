"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Panel } from "@/components/onboarding-frame";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { requestPasswordResetAction, type FormState } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordResetAction, {});
  const errors = state.fieldErrors ?? {};

  if (state.done) {
    return (
      <Panel
        title="Check your inbox"
        intro={
          <>
            If an account exists for <b className="font-mono font-medium">{state.values?.email}</b>, we’ve sent a link
            to choose a new password. It expires in 1 hour.
          </>
        }
        footer={
          <Link href="/sign-in" className="text-[13px]">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <form action={action} noValidate>
      <Panel
        title="Reset your password"
        intro="Enter the email you signed up with and we’ll send a reset link."
        footer={
          <>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <Link href="/sign-in" className="text-[12.5px]">
              Back to sign in
            </Link>
          </>
        }
      >
        <Field label="Email" message={errors.email}>
          <TextInput
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            invalid={Boolean(errors.email)}
            mono
            required
          />
        </Field>
      </Panel>
    </form>
  );
}
