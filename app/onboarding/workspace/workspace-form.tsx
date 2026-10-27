"use client";

import { useActionState, useMemo, useSyncExternalStore } from "react";
import { Panel } from "@/components/onboarding-frame";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Select, TextInput } from "@/components/ui/field";
import { createWorkspaceAction, type WorkspaceFormState } from "./actions";

const FALLBACK_TZ = "UTC";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

const noopSubscribe = () => () => {};

export function WorkspaceForm() {
  const [state, action, pending] = useActionState<WorkspaceFormState, FormData>(createWorkspaceAction, {});
  // The browser's timezone is only known on the client; the server renders UTC.
  const detected = useSyncExternalStore(noopSubscribe, detectTimezone, () => FALLBACK_TZ);
  // Server and browser ICU zone lists differ, so the full list renders client-side only.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const zones = useMemo(() => {
    if (!mounted) return [detected];
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [detected, ...all.filter((z) => z !== detected)];
  }, [detected, mounted]);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate>
      <Panel
        title="Name your workspace"
        intro="Usually your agency’s name. It appears on client reports — you can add a logo and brand colour later."
        footer={
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating workspace…" : "Continue"}
          </Button>
        }
      >
        <FormAlert>{state.formError}</FormAlert>
        <Field label="Agency name" message={errors.name}>
          <TextInput
            name="name"
            type="text"
            autoComplete="organization"
            defaultValue={state.values?.name}
            invalid={Boolean(errors.name)}
            required
          />
        </Field>
        <Field label="Timezone for reports and timestamps" message={errors.timezone}>
          <Select name="timezone" key={detected} defaultValue={state.values?.timezone ?? detected}>
            {zones.map((tz) => (
              <option key={tz} value={tz}>
                {tz === detected ? `${tz.replaceAll("_", " ")} — detected` : tz.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
      </Panel>
    </form>
  );
}
