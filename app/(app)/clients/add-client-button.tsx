"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { createClientAction } from "./actions";

export function AddClientButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    startTransition(async () => {
      const result = await createClientAction(data);
      if (!result?.ok) return setError(result?.error ?? "Something went wrong.");
      form.reset();
      close();
      toast.show(`${name} added`);
      router.push(`/clients/${result.clientId}`);
    });
  };

  return (
    <>
      <Button size="sm" className="ml-auto self-center" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add client
      </Button>
      <Dialog open={open} onClose={close} title="Add client">
        <form onSubmit={submit} noValidate className="flex flex-col">
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <Field label="Client name" message={error ?? undefined} messageId="add-client-err">
              <TextInput
                name="name"
                maxLength={120}
                invalid={Boolean(error)}
                aria-describedby="add-client-err"
                autoFocus
                required
              />
            </Field>
            <Field label="Contact name" hint="optional">
              <TextInput name="contactName" maxLength={120} />
            </Field>
            <Field label="Contact email" hint="optional">
              <TextInput name="contactEmail" type="email" maxLength={254} mono />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <PlusIcon />
              {pending ? "Adding…" : "Add client"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
