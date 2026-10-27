"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { FormAlert } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { IncidentStatus } from "@/lib/generated/prisma/enums";
import { incidentAction, type IncidentAction } from "./actions";

export function IncidentActions({
  incidentId,
  status,
  siteId,
  code,
}: {
  incidentId: string;
  status: IncidentStatus;
  siteId: string;
  code: string;
}) {
  const toast = useToast();
  const [confirmMute, setConfirmMute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: IncidentAction, message: string, undo?: IncidentAction) =>
    startTransition(async () => {
      const result = await incidentAction(incidentId, action);
      if (!result.ok) return setError(result.error);
      setError(null);
      setConfirmMute(false);
      toast.show(message, undo ? () => run(undo, "Change undone") : undefined);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <Button
            size="sm"
            onClick={() => run("acknowledge", `${code} acknowledged`, "unacknowledge")}
            disabled={pending}
          >
            Acknowledge
          </Button>
        ) : null}
        {status === "open" || status === "acknowledged" ? (
          <Button variant="secondary" size="sm" onClick={() => setConfirmMute((v) => !v)} aria-expanded={confirmMute}>
            Mute alerts…
          </Button>
        ) : null}
        {status === "muted" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("unmute", `${code} unmuted`, "mute")}
            disabled={pending}
          >
            Unmute
          </Button>
        ) : null}
        <ButtonLink href={`/websites/${siteId}`} variant="secondary" size="sm">
          Open website
        </ButtonLink>
      </div>
      {confirmMute ? (
        <ConfirmPanel
          label="Confirm mute"
          title={`Mute alerts for ${code}?`}
          points={[
            "No alert emails are sent for this incident while it’s muted.",
            "Detection continues: the incident still updates and resolves automatically.",
            "History is kept, and you can unmute at any time.",
          ]}
          actions={
            <>
              <Button size="sm" onClick={() => run("mute", `${code} muted`, "unmute")} disabled={pending}>
                Mute alerts
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmMute(false)}>
                Cancel
              </Button>
            </>
          }
        />
      ) : null}
      <FormAlert>{error}</FormAlert>
      {status === "resolved" ? (
        <span className="text-xs text-muted">
          Resolved automatically — incidents can’t be closed by hand.{" "}
          <Link href={`/websites/${siteId}#incidents`}>Site history</Link>
        </span>
      ) : null}
    </div>
  );
}
