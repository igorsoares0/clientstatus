"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { FormAlert } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { archiveSiteAction, restoreSiteAction, setSitesPausedAction } from "../actions";

type Open = null | "pause" | "archive";

export function SiteActions({
  siteId,
  hostname,
  state,
  slotsFree,
  maxSites,
  planName,
  moreSites,
  status,
}: {
  siteId: string;
  hostname: string;
  state: "active" | "paused" | "archived";
  slotsFree: number;
  maxSites: number;
  planName: string;
  /** What to do for more slots: upgrade, or contact us on the largest plan. */
  moreSites: string;
  status: ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, undo?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      setError(null);
      setOpen(null);
      toast.show(done, undo);
    });

  const pause = () =>
    act(
      () => setSitesPausedAction([siteId], true),
      `${hostname} paused · history kept`,
      () => act(() => setSitesPausedAction([siteId], false), "Change undone"),
    );
  const resume = () => act(() => setSitesPausedAction([siteId], false), `${hostname} resumed · awaiting first check`);
  const archive = () =>
    act(
      () => archiveSiteAction(siteId),
      `${hostname} archived · history kept`,
      () => act(() => restoreSiteAction(siteId), "Change undone"),
    );
  const restore = () => act(() => restoreSiteAction(siteId), `${hostname} restored · awaiting first check`);

  const toggle = (which: Exclude<Open, null>) => {
    setError(null);
    setOpen((o) => (o === which ? null : which));
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {state === "active" ? (
          <Button variant="secondary" size="sm" onClick={() => toggle("pause")} aria-expanded={open === "pause"}>
            Pause monitoring…
          </Button>
        ) : null}
        {state === "paused" ? (
          <Button size="sm" onClick={resume} disabled={pending || slotsFree <= 0}>
            Resume monitoring
          </Button>
        ) : null}
        {state === "archived" ? (
          <Button size="sm" onClick={restore} disabled={pending || slotsFree <= 0}>
            Restore website
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => toggle("archive")} aria-expanded={open === "archive"}>
            Archive…
          </Button>
        )}
        {(state === "paused" || state === "archived") && slotsFree <= 0 ? (
          <span className="self-center text-[12.5px] text-muted">
            Your plan is full ({maxSites} sites on {planName}). Pause another site or {moreSites}.
          </span>
        ) : null}
      </div>
      {status}
      {open === "pause" ? (
        <ConfirmPanel
          label="Confirm pause"
          title={`Pause monitoring for ${hostname}?`}
          points={[
            "Uptime, SSL and domain checks stop; scheduled audits are skipped.",
            "No alerts are sent while paused.",
            "History is kept. Reports will show the paused time as a gap.",
            `Frees 1 of your ${maxSites} plan slots.`,
          ]}
          actions={
            <>
              <Button size="sm" onClick={pause} disabled={pending}>
                Pause monitoring
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </>
          }
        />
      ) : null}
      {open === "archive" ? (
        <ConfirmPanel
          label="Confirm archive"
          title={`Archive ${hostname}?`}
          points={[
            "Monitoring stops and the website leaves the Websites list.",
            "History, incidents and past reports are kept and stay readable.",
            "You can restore it later if a plan slot is free.",
          ]}
          actions={
            <>
              <Button size="sm" onClick={archive} disabled={pending}>
                Archive website
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </>
          }
        />
      ) : null}
      <FormAlert>{error}</FormAlert>
    </>
  );
}
