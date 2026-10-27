"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { retryReportAction } from "../actions";

export function RetryButton({ reportId }: { reportId: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      className="self-start"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await retryReportAction(reportId);
          toast.show(r.ok ? "Generating again…" : r.error);
        })
      }
    >
      Try again
    </Button>
  );
}
