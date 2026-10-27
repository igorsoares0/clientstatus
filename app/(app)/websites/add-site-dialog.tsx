"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, TextInput } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { previewSiteUrl } from "@/lib/url-preview";
import { addSiteAction, type AddSiteState } from "./actions";

type Option = { id: string; name: string };

export function AddSiteDialog({
  open,
  onClose,
  clients,
  slotsFree,
  maxSites,
  defaultClientId = "",
}: {
  open: boolean;
  onClose: () => void;
  clients: Option[];
  slotsFree: number;
  maxSites: number;
  defaultClientId?: string;
}) {
  const toast = useToast();
  const [result, setResult] = useState<AddSiteState>(null);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const r = await addSiteAction(null, data);
      if (r?.ok) {
        setResult(null);
        setUrl("");
        form.reset();
        onClose();
        toast.show(`${r.hostname} added · awaiting first check`);
      } else setResult(r);
    });
  };

  const close = () => {
    setResult(null);
    onClose();
  };

  const preview = previewSiteUrl(url);
  const error = result && !result.ok ? result.error : null;
  const hint = error
    ? error
    : preview.ok
      ? `Will monitor ${preview.text}${preview.https ? "" : " — this site isn’t using HTTPS"}`
      : "http:// or https:// only — https is added if you leave it out.";

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add website"
      aside={`${Math.max(slotsFree, 0)} of ${maxSites} slots free`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col">
        <div className="flex flex-col gap-3.5 px-5 py-4">
          <Field label="Website address" message={hint} messageTone={error ? "error" : "muted"} messageId="add-msg">
            <TextInput
              name="url"
              type="text"
              inputMode="url"
              placeholder="https://clientsite.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setResult(null);
              }}
              invalid={Boolean(result && !result.ok && result.field === "url")}
              aria-describedby="add-msg"
              mono
              autoFocus
              required
            />
          </Field>
          <Field label="Display name" hint="optional — defaults to the hostname">
            <TextInput name="name" type="text" maxLength={120} />
          </Field>
          <Field label="Client">
            <Select name="clientId" defaultValue={defaultClientId} key={defaultClientId}>
              <option value="">Unassigned</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add website"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
