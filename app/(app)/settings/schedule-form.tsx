"use client";

import { useState, useTransition } from "react";
import { UnsavedBar } from "@/components/ui/unsaved-bar";
import { useToast } from "@/components/ui/toast";
import { saveScheduleAction } from "./actions";

type State = { reportDelivery: "review" | "auto"; linkExpiryDays: number };

export function ScheduleForm({
  canManage,
  initial,
  timezone,
}: {
  canManage: boolean;
  initial: State;
  timezone: string;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [cur, setCur] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changes = [
    cur.reportDelivery !== saved.reportDelivery ? "delivery" : null,
    cur.linkExpiryDays !== saved.linkExpiryDays ? "link expiry" : null,
  ].filter(Boolean) as string[];
  const save = () =>
    startTransition(async () => {
      const r = await saveScheduleAction(cur);
      if (!r.ok) return setError(r.error);
      setSaved(cur);
      setError(null);
      toast.show("Report schedule saved");
    });

  return (
    <fieldset disabled={!canManage} className="m-0 flex max-w-[760px] flex-col gap-4 border-0 p-0">
      <section aria-labelledby="h-sc" className="flex flex-col gap-3 border border-border bg-surface px-4 py-3.5">
        <h2 id="h-sc" className="m-0 text-[15px] font-semibold">
          Monthly reports
        </h2>
        <p className="m-0 text-[13px] text-ink-2">
          Reports for the previous month are generated on the 1st at 06:00 ({timezone}).
        </p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-semibold">Delivery</legend>
          <label className="flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
            <input
              type="radio"
              name="del"
              checked={cur.reportDelivery === "review"}
              onChange={() => setCur((c) => ({ ...c, reportDelivery: "review" }))}
              className="mt-[3px]"
            />
            <span>
              Hold every report for review{" "}
              <span className="text-muted">— nothing is sent until someone presses Send.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
            <input
              type="radio"
              name="del"
              checked={cur.reportDelivery === "auto"}
              onChange={() => setCur((c) => ({ ...c, reportDelivery: "auto" }))}
              className="mt-[3px]"
            />
            <span>
              Send automatically at 07:00{" "}
              <span className="text-muted">
                — except reports with data gaps or unconfirmed recipients, which are always held for review.
              </span>
            </span>
          </label>
        </fieldset>
        <label className="flex flex-wrap items-center gap-2 text-[13.5px]">
          Private web link in the email expires after
          <select
            value={cur.linkExpiryDays}
            onChange={(e) => setCur((c) => ({ ...c, linkExpiryDays: Number(e.target.value) }))}
            className="h-8 border border-border-strong bg-surface px-2 text-[13px]"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </section>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-down">
          {error}
        </p>
      ) : null}
      <UnsavedBar changes={changes} onSave={save} onDiscard={() => setCur(saved)} pending={pending} />
    </fieldset>
  );
}
