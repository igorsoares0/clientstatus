"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { updateSiteSettingsAction } from "../actions";

type Settings = {
  name: string;
  clientId: string;
  timeoutMs: number;
  downPolicy: "server_errors" | "non_success";
  respectRobots: boolean;
  alertsEnabled: boolean;
};

const TIMEOUTS = [
  { ms: 5000, label: "5 seconds" },
  { ms: 10000, label: "10 seconds (default)" },
  { ms: 15000, label: "15 seconds" },
  { ms: 20000, label: "20 seconds" },
];

const inputClass = "h-9 border border-border-strong bg-surface px-2.5 text-sm font-normal";

export function SiteSettingsForm({
  siteId,
  initial,
  clients,
  intervalText,
  disabled,
}: {
  siteId: string;
  initial: Settings;
  clients: { id: string; name: string }[];
  intervalText: string;
  disabled: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = (Object.keys(form) as (keyof Settings)[]).some((k) => form[k] !== saved[k]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setNote("");
  };

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateSiteSettingsAction(siteId, null, data);
      if (!result?.ok) {
        setError(result?.error ?? "Something went wrong.");
        return;
      }
      setError(null);
      setSaved(form);
      setNote("Saved");
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col border border-border bg-surface">
      <fieldset
        disabled={disabled || pending}
        className="m-0 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-6 gap-y-4 border-0 p-4"
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Display name
          <input
            name="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={120}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Client
          <select
            name="clientId"
            value={form.clientId}
            onChange={(e) => set("clientId", e.target.value)}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Request timeout
          <select
            name="timeoutMs"
            value={form.timeoutMs}
            onChange={(e) => set("timeoutMs", Number(e.target.value))}
            className={inputClass}
          >
            {TIMEOUTS.map((t) => (
              <option key={t.ms} value={t.ms}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-semibold">Check interval</span>
          <span className="flex h-9 items-center text-ink-2">{intervalText}</span>
        </div>
        <fieldset className="col-span-full m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-semibold">What counts as down</legend>
          <label className="flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
            <input
              type="radio"
              name="downPolicy"
              value="server_errors"
              checked={form.downPolicy === "server_errors"}
              onChange={() => set("downPolicy", "server_errors")}
              className="mt-[3px]"
            />
            <span className="min-w-0 flex-1">
              Server errors (5xx) and connection failures{" "}
              <span className="text-muted">— recommended. 4xx responses are recorded but don’t open incidents.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
            <input
              type="radio"
              name="downPolicy"
              value="non_success"
              checked={form.downPolicy === "non_success"}
              onChange={() => set("downPolicy", "non_success")}
              className="mt-[3px]"
            />
            <span className="min-w-0 flex-1">
              Any response other than 2xx or 3xx{" "}
              <span className="text-muted">— use if this page should never return 401/403/404.</span>
            </span>
          </label>
        </fieldset>
        <label className="col-span-full flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
          <input
            type="checkbox"
            name="alertsEnabled"
            checked={form.alertsEnabled}
            onChange={(e) => set("alertsEnabled", e.target.checked)}
            className="mt-[3px]"
          />
          <span className="min-w-0 flex-1">
            Send alert emails for this website{" "}
            <span className="text-muted">
              — uses the workspace alert settings. Incidents still open and show in the app when this is off.
            </span>
          </span>
        </label>
        <label className="col-span-full flex cursor-pointer items-start gap-2 text-[13.5px] leading-[1.45]">
          <input
            type="checkbox"
            name="respectRobots"
            checked={form.respectRobots}
            onChange={(e) => set("respectRobots", e.target.checked)}
            className="mt-[3px]"
          />
          <span className="min-w-0 flex-1">
            Follow robots.txt when auditing{" "}
            <span className="text-muted">
              — recommended. Turn off only for your own sites that block crawlers by mistake.
            </span>
          </span>
        </label>
        <p className="col-span-full m-0 text-[12.5px] leading-[1.45] text-muted">
          Incidents open after 2 consecutive failed checks and resolve after 2 consecutive passes.
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-rule px-4 py-3">
        <Button type="submit" size="sm" disabled={!dirty || pending || disabled}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <span aria-live="polite" className="text-[12.5px] text-muted">
          {disabled ? "Restore the website to change its settings." : dirty ? "Unsaved changes" : note}
        </span>
      </div>
      {error ? (
        <div className="px-4 pb-3">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}
    </form>
  );
}
