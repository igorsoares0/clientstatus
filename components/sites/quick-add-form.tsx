"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSiteAction } from "@/app/(app)/websites/actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { previewSiteUrl } from "@/lib/url-preview";

/**
 * Website address + free-text client, as in the Overview empty state and the
 * onboarding "First website" step. Unknown client names become new clients
 * (Admin+); the server decides.
 */
export function QuickAddForm({
  redirectTo,
  variant = "inline",
  clientLabel = "Client",
  clientHint = "optional",
}: {
  redirectTo?: string;
  variant?: "inline" | "stacked";
  clientLabel?: string;
  clientHint?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = previewSiteUrl(url);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await addSiteAction(null, data);
      if (!result?.ok) return setError(result?.error ?? "Something went wrong.");
      setError(null);
      setUrl("");
      form.reset();
      if (redirectTo) router.push(redirectTo);
      else setAdded(result.hostname);
    });
  };

  const hint = error
    ? error
    : preview.ok
      ? `We’ll check ${preview.text}${preview.https ? "" : " — note this site isn’t using HTTPS."}`
      : "Include the subdomain if it matters, e.g. shop.clientsite.com";

  const urlField = (
    <Field label="Website address" message={hint} messageTone={error ? "error" : "muted"} messageId="quick-url-msg">
      <TextInput
        name="url"
        type="text"
        inputMode="url"
        placeholder="clientsite.com"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        invalid={Boolean(error)}
        aria-describedby="quick-url-msg"
        mono
        required
      />
    </Field>
  );
  const clientField = (
    <Field label={clientLabel} hint={clientHint}>
      <TextInput name="clientName" type="text" placeholder="e.g. Harbour Dental Group" maxLength={120} />
    </Field>
  );

  if (variant === "stacked") {
    return (
      <form onSubmit={submit} noValidate className="flex flex-col">
        <div className="flex flex-col gap-3.5 px-6 py-4">
          {urlField}
          {clientField}
        </div>
        <div className="flex flex-col gap-2.5 border-t border-rule px-6 pt-3.5 pb-5">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Adding…" : "Start monitoring"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-[1_1_280px]">{urlField}</div>
        <div className="flex-[0_1_220px]">{clientField}</div>
        <Button type="submit" disabled={pending} className="mt-[25px]">
          {pending ? "Adding…" : "Start monitoring"}
        </Button>
      </div>
      {added ? (
        <div
          role="status"
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border border-border bg-canvas px-3.5 py-3"
        >
          <span className="font-mono font-semibold">{added}</span>
          <span className="text-muted">○ Unknown — awaiting first check</span>
        </div>
      ) : null}
    </form>
  );
}
