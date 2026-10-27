"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requeueJobAction } from "./actions";

export function RequeueButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requeueJobAction(jobId);
            setMessage(r.ok ? "Requeued" : r.error);
          })
        }
      >
        {pending ? "Requeuing…" : "Requeue"}
      </Button>
      {message ? (
        <span role="status" className="text-xs text-muted">
          {message}
        </span>
      ) : null}
    </span>
  );
}
