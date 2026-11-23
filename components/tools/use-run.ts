"use client";

import { useEffect, useState } from "react";

// Polls a queued tool run (GET /api/tools/runs/<id>) until it completes or fails.

export type RunState<T> =
  | { status: "idle" }
  | { status: "queued" | "running"; runId: string }
  | { status: "completed"; runId: string; result: T }
  | { status: "failed"; runId: string | null; error: string };

const POLL_MS = 3000;
const GIVE_UP_MS = 10 * 60_000;

export function useRun<T>(runId: string | null): RunState<T> {
  // Polled state is tagged with its run, so a new run starts as "queued" without a reset in the effect.
  const [polled, setState] = useState<RunState<T>>({ status: "idle" });

  useEffect(() => {
    if (!runId) return;
    const id = runId;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/tools/runs/${id}`, { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          run?: { status: string; result: T; error: string | null };
          error?: string;
        };
        if (stopped) return;
        const run = data.run;
        if (!data.ok || !run) return setState({ status: "failed", runId: id, error: data.error ?? "Run not found." });
        if (run.status === "completed") return setState({ status: "completed", runId: id, result: run.result });
        if (run.status === "failed") {
          return setState({ status: "failed", runId: id, error: "We couldn’t finish this check. Try again later." });
        }
        setState({ status: run.status === "running" ? "running" : "queued", runId: id });
      } catch {
        // A dropped poll is retried on the next tick.
      }
      if (Date.now() - started > GIVE_UP_MS) {
        return setState({
          status: "failed",
          runId: id,
          error: "This is taking longer than expected. Try again later.",
        });
      }
      timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId]);

  if (!runId) return { status: "idle" };
  return "runId" in polled && polled.runId === runId ? polled : { status: "queued", runId };
}
