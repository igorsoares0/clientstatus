"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Panel } from "@/components/onboarding-frame";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, TextInput } from "@/components/ui/field";
import { signInAction, type FormState } from "../actions";

/** URL-dependent bits only, so the form itself stays in the static shell. */
function SearchParamFields({ hideNotice }: { hideNotice: boolean }) {
  const params = useSearchParams();
  const next = params.get("next");
  const showNotice = params.get("reset") === "1" && !hideNotice;
  return (
    <>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {showNotice ? (
        <div role="status" className="border border-border bg-canvas px-3.5 py-2.5 text-[13px]">
          <span aria-hidden="true" className="text-up">
            ●
          </span>{" "}
          Password changed. Sign in with your new password.
        </div>
      ) : null}
    </>
  );
}

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate>
      <Panel
        title="Sign in"
        footer={
          <>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
            <span className="flex flex-wrap justify-between gap-2 text-[12.5px] text-muted">
              <span>
                New to Client Status? <Link href="/sign-up">Create an account</Link>
              </span>
              <Link href="/forgot-password">Forgot your password?</Link>
            </span>
          </>
        }
      >
        <Suspense fallback={null}>
          <SearchParamFields hideNotice={Boolean(state.formError)} />
        </Suspense>
        <FormAlert>{state.formError}</FormAlert>
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
        <Field label="Password" message={errors.password}>
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
            required
          />
        </Field>
      </Panel>
    </form>
  );
}
