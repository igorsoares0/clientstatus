"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Panel } from "@/components/onboarding-frame";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, TextInput } from "@/components/ui/field";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/plans";
import { passwordHint } from "@/lib/validation";
import { signUpAction, type FormState } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const [password, setPassword] = useState("");
  const errors = state.fieldErrors ?? {};
  const tried = Boolean(state.fieldErrors);
  const hint =
    errors.password && password.length === 0
      ? { text: errors.password, tone: "error" as const }
      : passwordHint(password, tried);

  return (
    <form action={action} noValidate>
      <Panel
        title="Create your account"
        intro={`${TRIAL_DAYS}-day trial with full ${PLANS[TRIAL_PLAN].name} features. No card needed until it ends.`}
        footer={
          <>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
            <span className="text-[12.5px] text-muted">
              Already have one? <Link href="/sign-in">Sign in</Link>
            </span>
          </>
        }
      >
        <FormAlert>{state.formError}</FormAlert>
        <Field label="Your name" message={errors.name}>
          <TextInput
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={state.values?.name}
            invalid={Boolean(errors.name)}
            required
          />
        </Field>
        <Field label="Work email" message={errors.email}>
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
        <Field label="Password" message={hint.text} messageTone={hint.tone} messageId="pw-hint">
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={hint.tone === "error"}
            aria-describedby="pw-hint"
            required
          />
        </Field>
      </Panel>
    </form>
  );
}
