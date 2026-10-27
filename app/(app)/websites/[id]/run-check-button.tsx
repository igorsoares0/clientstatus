"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { runCheckNowAction } from "../actions";

export function RunCheckButton({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await runCheckNowAction(siteId);
      if (!result.ok) return toast.show(result.error);
      toast.show(result.queued ? "Check queued — the result appears in a few seconds" : "A check is already queued");
      // Pick up the result once the worker has run it.
      setTimeout(() => router.refresh(), 5000);
    });

  return (
    <Button
      size="sm"
      onClick={run}
      disabled={disabled || pending}
      title={disabled ? "Resume monitoring to run a check" : undefined}
    >
      {pending ? "Queuing…" : "Run check now"}
    </Button>
  );
}
