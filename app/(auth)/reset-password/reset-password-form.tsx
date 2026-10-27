"use client";

import { useActionState, useState } from "react";
import { Panel } from "@/components/onboarding-frame";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, TextInput } from "@/components/ui/field";
import { passwordHint } from "@/lib/validation";
import { resetPasswordAction, type FormState } from "../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const [password, setPassword] = useState("");
  const hint = passwordHint(password, Boolean(state.fieldErrors));

  return (
    <form action={action} noValidate>
      <input type="hidden" name="token" value={token} />
      <Panel
        title="Choose a new password"
        intro="You’ll be signed out everywhere else once it’s changed."
        footer={
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
        }
      >
        <FormAlert>{state.formError}</FormAlert>
        <Field label="New password" message={hint.text} messageTone={hint.tone} messageId="pw-hint">
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
