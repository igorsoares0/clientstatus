"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { runAuditNowAction } from "../actions";

export function RunAuditButton({ siteId, disabled, busy }: { siteId: string; disabled: boolean; busy: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result = await runAuditNowAction(siteId);
      toast.show(result.ok ? "Audit queued — results appear here when it finishes" : result.error);
    });
  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={disabled || pending}>
      {busy ? "Audit in progress" : pending ? "Queuing…" : "Rerun audit"}
    </Button>
  );
}
