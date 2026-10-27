"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { UnsavedBar } from "@/components/ui/unsaved-bar";
import { useToast } from "@/components/ui/toast";
import { ALERT_EVENTS, type AlertEvent, type AlertEvents } from "@/lib/notify/settings";
import { saveAlertsAction } from "./actions";

type Member = { id: string; name: string; email: string; role: string; verified: boolean };
type State = { recipientUserIds: string[]; events: AlertEvents; repeatMinutes: number };

const REPEAT_NOTE: Record<number, string> = {
  30: "Up to 2 emails an hour per open, unacknowledged incident.",
  60: "Up to 1 email an hour per open, unacknowledged incident, then a recovery email when it resolves.",
  240: "Up to 1 email every 4 hours per open, unacknowledged incident.",
  0: "One email when an incident opens and one when it resolves. Nothing in between.",
};
const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as Record<string, string>;
const box = "flex flex-col border border-border bg-surface";

export function AlertsForm({
  canManage,
  initial,
  members,
  overrides,
}: {
  canManage: boolean;
  initial: State;
  members: Member[];
  overrides: { id: string; name: string; normalizedHostname: string }[];
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [cur, setCur] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changes = [
    JSON.stringify([...cur.recipientUserIds].sort()) !== JSON.stringify([...saved.recipientUserIds].sort())
      ? "recipients"
      : null,
    JSON.stringify(cur.events) !== JSON.stringify(saved.events) ? "events" : null,
    cur.repeatMinutes !== saved.repeatMinutes ? "repeat alerts" : null,
  ].filter(Boolean) as string[];
  const noRecipients = cur.recipientUserIds.length === 0;

  const toggleRecipient = (id: string) =>
    setCur((c) => ({
      ...c,
      recipientUserIds: c.recipientUserIds.includes(id)
        ? c.recipientUserIds.filter((x) => x !== id)
        : [...c.recipientUserIds, id],
    }));
  const setEvent = (k: AlertEvent, which: "opened" | "resolved", v: boolean) =>
    setCur((c) => ({ ...c, events: { ...c.events, [k]: { ...c.events[k], [which]: v } } }));

  const save = () =>
    startTransition(async () => {
      const r = await saveAlertsAction(cur);
      if (!r.ok) return setError(r.error);
      setSaved(cur);
      setError(null);
      toast.show("Alert settings saved");
    });

  return (
    <fieldset disabled={!canManage} className="m-0 flex flex-col gap-4 border-0 p-0">
      <section aria-labelledby="h-rec" className={box}>
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-rule px-4 py-3">
          <h2 id="h-rec" className="m-0 text-[15px] font-semibold">
            Who gets alert emails
          </h2>
          <span className="text-[12.5px] text-muted">
            Team members only. Clients never receive alerts — they get the monthly report.
          </span>
        </div>
        {members.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-center gap-3 border-b border-rule-soft px-4 py-2 text-[13.5px] last:border-0"
          >
            <input
              type="checkbox"
              checked={cur.recipientUserIds.includes(m.id)}
              onChange={() => toggleRecipient(m.id)}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>
                {m.name} <span className="text-muted">· {ROLE[m.role]}</span>
              </span>
              <span className="truncate font-mono text-xs text-muted">{m.email}</span>
            </span>
            <span className={`text-xs ${m.verified ? "text-muted" : "text-degraded"}`}>
              {m.verified ? "Verified" : "Email not verified — won’t receive alerts"}
            </span>
          </label>
        ))}
        {noRecipients ? (
          <p role="alert" className="m-0 border-t border-rule px-4 py-2 text-[13px] text-down">
            ▲ Nobody will be emailed about downtime. Select at least one person.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="h-ev" className={box}>
        <h2 id="h-ev" className="m-0 border-b border-rule px-4 py-3 text-[15px] font-semibold">
          What sends an email
        </h2>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-rule text-left text-xs tracking-[.03em] text-muted">
              <th scope="col" className="px-4 py-2 font-normal">
                EVENT
              </th>
              <th scope="col" className="px-2 py-2 text-center font-normal">
                OPENED
              </th>
              <th scope="col" className="px-4 py-2 text-center font-normal">
                RESOLVED
              </th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ALERT_EVENTS) as AlertEvent[]).map((k) => {
              const e = ALERT_EVENTS[k];
              const ev = cur.events[k] as { opened: boolean; resolved?: boolean };
              return (
                <tr key={k} className="border-b border-rule-soft last:border-0">
                  <td className="px-4 py-2">
                    <span className="block font-semibold">{e.label}</span>
                    <span className="block text-xs text-muted">{e.rule}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${e.label}: email when opened`}
                      checked={ev.opened}
                      onChange={(x) => setEvent(k, "opened", x.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    {e.resolves ? (
                      <input
                        type="checkbox"
                        aria-label={`${e.label}: email when resolved`}
                        checked={Boolean(ev.resolved)}
                        onChange={(x) => setEvent(k, "resolved", x.target.checked)}
                      />
                    ) : (
                      <span className="text-faint" aria-label="Not applicable">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="m-0 border-t border-rule px-4 py-2.5 text-[12.5px] text-muted">
          Inconclusive results (timeouts, rate limits, bot challenges) never send email. Audit findings appear in the
          app and the monthly report only.
        </p>
      </section>

      <section aria-labelledby="h-cd" className={`${box} gap-2 px-4 py-3`}>
        <h2 id="h-cd" className="m-0 text-[15px] font-semibold">
          Repeat alerts
        </h2>
        <label className="flex flex-wrap items-center gap-2 text-[13.5px]">
          Minimum time between emails for the same incident
          <select
            value={cur.repeatMinutes}
            onChange={(e) => setCur((c) => ({ ...c, repeatMinutes: Number(e.target.value) }))}
            className="h-8 border border-border-strong bg-surface px-2 text-[13px]"
          >
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes (default)</option>
            <option value={240}>4 hours</option>
            <option value={0}>Never repeat</option>
          </select>
        </label>
        <p className="m-0 text-[13px] text-ink-2">
          {REPEAT_NOTE[cur.repeatMinutes]} Acknowledging or muting an incident stops repeats.
        </p>
      </section>

      <section aria-labelledby="h-ov" className={box}>
        <h2 id="h-ov" className="m-0 border-b border-rule px-4 py-3 text-[15px] font-semibold">
          Websites with alerts turned off <span className="font-mono font-normal text-muted">{overrides.length}</span>
        </h2>
        {overrides.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-muted">
            None. You can turn alerts off for a website in its settings.
          </p>
        ) : (
          overrides.map((s) => (
            <div
              key={s.id}
              className="flex justify-between gap-2 border-b border-rule-soft px-4 py-2 text-[13.5px] last:border-0"
            >
              <Link href={`/websites/${s.id}#settings`}>{s.name}</Link>
              <span className="font-mono text-xs text-muted">{s.normalizedHostname}</span>
            </div>
          ))
        )}
      </section>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-down">
          {error}
        </p>
      ) : null}
      <UnsavedBar
        changes={changes}
        onSave={save}
        onDiscard={() => setCur(saved)}
        pending={pending}
        blocked={noRecipients ? "Select at least one alert recipient to save." : null}
      />
    </fieldset>
  );
}
