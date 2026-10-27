"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resendVerificationAction, type FormState } from "../actions";

export function ResendButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendVerificationAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="secondary" disabled={pending || state.done}>
        {state.done ? "Sent again" : pending ? "Sending…" : "Resend email"}
      </Button>
      {state.formError ? <p className="m-0 mt-1 text-[12.5px] text-down">{state.formError}</p> : null}
    </form>
  );
}
