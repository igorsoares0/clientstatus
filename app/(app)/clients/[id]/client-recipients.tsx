"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addRecipientAction } from "../../reports/actions";
import { removeRecipientAction } from "../actions";

type Recipient = { id: string; name: string | null; email: string; confirmed: boolean; bounced: boolean };

export function ClientRecipients({
  clientId,
  canManage,
  recipients,
}: {
  clientId: string;
  canManage: boolean;
  recipients: Recipient[];
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await addRecipientAction(clientId, email, name);
      if (!r.ok) return setError(r.error);
      setEmail("");
      setName("");
      setError(null);
      toast.show("Recipient added — confirm them when you send the first report");
    });
  };
  const remove = (id: string, address: string) =>
    startTransition(async () => {
      const r = await removeRecipientAction(id);
      toast.show(r.ok ? `${address} removed` : r.error);
    });

  return (
    <div className="flex flex-col gap-2">
      {recipients.length === 0 ? <p className="m-0 text-[13px] text-muted">No recipients yet.</p> : null}
      {recipients.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2 text-[13px]">
          <span className="flex min-w-0 flex-col">
            {r.name ? <span className="truncate">{r.name}</span> : null}
            <span className="truncate font-mono text-xs">{r.email}</span>
            <span className={`text-xs ${r.bounced ? "text-down" : r.confirmed ? "text-muted" : "text-degraded"}`}>
              {r.bounced ? "◆ Bounced" : r.confirmed ? "Confirmed" : "Not yet confirmed"}
            </span>
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={() => remove(r.id, r.email)}
              disabled={pending}
              className="border-0 bg-transparent p-0 text-xs text-muted underline"
              aria-label={`Remove ${r.email}`}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {canManage ? (
        <form onSubmit={add} className="flex flex-col gap-1.5 border-t border-rule pt-2.5">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-8 border border-border-strong px-2 font-mono text-xs font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            <span>
              Name <span className="font-normal text-muted">optional</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="h-8 border border-border-strong px-2 text-[13px] font-normal"
            />
          </label>
          {error ? (
            <p role="alert" className="m-0 text-xs text-down">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !email.trim()}
            className="self-start"
          >
            Add recipient
          </Button>
        </form>
      ) : null}
    </div>
  );
}
