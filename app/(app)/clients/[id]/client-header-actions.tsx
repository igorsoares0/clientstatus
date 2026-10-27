"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { FormAlert } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { archiveClientAction, restoreClientAction, updateClientAction } from "../actions";

type ClientFields = { id: string; name: string; contactName: string; contactEmail: string };

const inputClass = "h-9 border border-border-strong bg-surface px-2.5 text-sm font-normal";

export function ClientHeaderActions({
  client,
  archived,
  canManage,
  siteCount,
  activeSites,
  subtitle,
}: {
  client: ClientFields;
  archived: boolean;
  canManage: boolean;
  siteCount: number;
  activeSites: number;
  subtitle: ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<null | "edit" | "archive">(null);
  const [mode, setMode] = useState<"unassign" | "pause">("unassign");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (which: "edit" | "archive") => {
    setError(null);
    setOpen((o) => (o === which ? null : which));
  };

  const saveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateClientAction(client.id, data);
      if (!result.ok) return setError(result.error);
      setOpen(null);
      setError(null);
      toast.show("Client details saved");
    });
  };

  const archive = () =>
    startTransition(async () => {
      const result = await archiveClientAction(client.id, mode);
      if (!result.ok) return setError(result.error);
      setOpen(null);
      toast.show(
        mode === "pause"
          ? `${client.name} archived · websites paused, history kept`
          : `${client.name} archived · websites moved to Unassigned`,
      );
    });

  const restore = () =>
    startTransition(async () => {
      const result = await restoreClientAction(client.id);
      if (!result.ok) return setError(result.error);
      toast.show(`${client.name} restored`);
    });

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-[26px] leading-[1.1] font-semibold font-stretch-84%">{client.name}</h1>
          {subtitle}
        </div>
        {canManage ? (
          <div className="ml-auto flex flex-wrap gap-2">
            {archived ? (
              <Button size="sm" onClick={restore} disabled={pending}>
                Restore client
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => toggle("edit")} aria-expanded={open === "edit"}>
                  Edit details
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggle("archive")}
                  aria-expanded={open === "archive"}
                >
                  Archive…
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {open === "edit" ? (
        <form
          onSubmit={saveEdit}
          aria-label="Edit client"
          className="flex max-w-[860px] flex-wrap items-end gap-3 border border-border-strong bg-canvas px-3.5 py-3"
        >
          <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-semibold">
            Client name
            <input name="name" defaultValue={client.name} maxLength={120} required className={inputClass} />
          </label>
          <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-[13px] font-semibold">
            <span>
              Contact name <span className="font-normal text-muted">optional</span>
            </span>
            <input name="contactName" defaultValue={client.contactName} maxLength={120} className={inputClass} />
          </label>
          <label className="flex flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-semibold">
            <span>
              Contact email <span className="font-normal text-muted">optional</span>
            </span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={client.contactEmail}
              maxLength={254}
              className={`${inputClass} font-mono`}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {open === "archive" ? (
        <ConfirmPanel
          label="Confirm archive"
          title={`Archive ${client.name}?`}
          points={[
            "Monitoring history, incidents and past reports are kept and stay readable.",
            "No new monthly reports are generated or sent.",
            "You can restore the client later.",
          ]}
          actions={
            <>
              <Button size="sm" onClick={archive} disabled={pending}>
                Archive client
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </>
          }
        >
          {siteCount > 0 ? (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[13px] font-semibold">
                Its {siteCount} website{siteCount === 1 ? "" : "s"}
              </legend>
              <label className="flex cursor-pointer gap-2 text-[13.5px]">
                <input type="radio" name="arch" checked={mode === "unassign"} onChange={() => setMode("unassign")} />
                Keep monitoring them as Unassigned websites
              </label>
              <label className="flex cursor-pointer gap-2 text-[13.5px]">
                <input type="radio" name="arch" checked={mode === "pause"} onChange={() => setMode("pause")} />
                <span>
                  Pause them too{" "}
                  <span className="text-muted">
                    — frees {activeSites} plan slot{activeSites === 1 ? "" : "s"}
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}
        </ConfirmPanel>
      ) : null}
      <FormAlert>{error}</FormAlert>
    </>
  );
}
