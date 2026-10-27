"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addRecipientAction, sendReportAction } from "../actions";

type Recipient = { id: string; name: string | null; email: string; confirmed: boolean; bounced: boolean };

const box = "flex flex-col gap-2 border border-border bg-surface px-4 py-3.5";

export function ReviewPanel({
  reportId,
  clientId,
  kind,
  disclosures,
  recipients,
  linkDays,
  brand,
}: {
  reportId: string;
  clientId: string;
  kind: "monthly" | "preview";
  disclosures: string[];
  recipients: Recipient[];
  linkDays: number;
  brand: { name: string; color: string; textColor: string; ratio: number; hasLogo: boolean };
}) {
  const toast = useToast();
  const router = useRouter();
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(recipients.filter((r) => !r.bounced).map((r) => r.id)));
  const [confirm, setConfirm] = useState(false);
  const [includeLink, setIncludeLink] = useState(true);
  const [days, setDays] = useState(linkDays);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = recipients.filter((r) => selected.has(r.id));
  const needsConfirm = chosen.some((r) => !r.confirmed);
  const blockers = [
    reviewed.size < disclosures.length
      ? `review ${disclosures.length - reviewed.size} data gap${disclosures.length - reviewed.size === 1 ? "" : "s"}`
      : null,
    chosen.length === 0 ? "choose at least one recipient" : null,
    needsConfirm && !confirm ? "confirm the recipients for the first delivery" : null,
  ].filter(Boolean) as string[];

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await addRecipientAction(clientId, email, "");
      if (!r.ok) return setError(r.error);
      setEmail("");
      setError(null);
      router.refresh();
    });
  };

  const send = () =>
    startTransition(async () => {
      const r = await sendReportAction(reportId, {
        recipientIds: [...selected],
        confirmRecipients: confirm,
        includeLink,
        linkDays: days,
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setSentLink(r.link);
      toast.show(`Report sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
    });

  if (sentLink !== null) {
    return (
      <div className={box}>
        <span className="font-semibold text-up">● Sent</span>
        {sentLink ? (
          <>
            <span className="text-[13px] text-ink-2">
              Private link — copy it now; for security it can’t be shown again:
            </span>
            <input
              readOnly
              value={sentLink}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 border border-border-strong px-2 font-mono text-xs"
              aria-label="Private report link"
            />
          </>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
          Show delivery status
        </Button>
      </div>
    );
  }

  return (
    <>
      <section aria-labelledby="g-h" className={box}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="g-h" className="m-0 text-[15px] font-semibold">
            1 · Data gaps
          </h2>
          <span className="text-xs text-muted">
            {reviewed.size} of {disclosures.length} reviewed
          </span>
        </div>
        {disclosures.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No gaps — monitoring and audit coverage were complete.</p>
        ) : (
          <>
            <p className="m-0 text-[12.5px] text-muted">
              Each gap is already disclosed in the report. Confirm you’ve read how it’s worded.
            </p>
            {disclosures.map((d, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 text-[13px] leading-[1.45]">
                <input
                  type="checkbox"
                  checked={reviewed.has(i)}
                  onChange={() => setReviewed((s) => toggle(s, i))}
                  className="mt-[3px]"
                />
                <span>
                  <span aria-hidden="true" className="text-degraded">
                    ▲
                  </span>{" "}
                  {d}
                </span>
              </label>
            ))}
          </>
        )}
      </section>

      <section aria-labelledby="p-h" className={box}>
        <h2 id="p-h" className="m-0 text-[15px] font-semibold">
          2 · Kept out of the report
        </h2>
        <ul className="m-0 pl-[18px] text-[13px] text-ink-2">
          <li>Internal notes on clients and incidents</li>
          <li>Team names, acknowledgements and muting</li>
          <li>Raw check diagnostics and response details</li>
        </ul>
      </section>

      <section aria-labelledby="b-h" className={box}>
        <h2 id="b-h" className="m-0 text-[15px] font-semibold">
          3 · Branding
        </h2>
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center text-xs font-bold"
            style={{ background: brand.color, color: brand.textColor }}
          >
            {brand.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </span>
          <span className="flex flex-col text-[13px]">
            <span>
              {brand.name} · <span className="font-mono">{brand.color}</span>
            </span>
            <span className="text-up">● Cover text contrast {brand.ratio} : 1 — passes AA</span>
          </span>
        </div>
        <p className="m-0 text-[12.5px] text-muted">
          {brand.hasLogo
            ? "Your logo sits on a white plate on the cover."
            : "No logo uploaded, so the cover shows your initials."}{" "}
          Change it in <Link href="/settings?tab=branding">Report branding</Link>; it applies to newly generated
          reports.
        </p>
      </section>

      <section aria-labelledby="r-h" className={box}>
        <h2 id="r-h" className="m-0 text-[15px] font-semibold">
          4 · Recipients
        </h2>
        {recipients.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No recipients yet — add the client’s contact below.</p>
        ) : null}
        {recipients.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => setSelected((s) => toggle(s, r.id))}
              className="mt-[3px]"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-xs">{r.email}</span>
              <span className={`text-xs ${r.bounced ? "text-down" : r.confirmed ? "text-muted" : "text-degraded"}`}>
                {r.bounced ? "◆ Bounced last time" : r.confirmed ? "Confirmed" : "Not yet confirmed"}
              </span>
            </span>
          </label>
        ))}
        <form onSubmit={add} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Add recipient email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add email address"
              className="h-8 w-full border border-border-strong px-2 font-mono text-xs"
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !email.trim()}>
            Add
          </Button>
        </form>
        {needsConfirm ? (
          <label className="flex cursor-pointer items-start gap-2 border border-warn-border bg-warn-tint px-3 py-2 text-[13px] leading-[1.45] text-warn-text">
            <input type="checkbox" checked={confirm} onChange={() => setConfirm((v) => !v)} className="mt-[3px]" />
            <span>
              <b>First delivery for this client.</b> I’ve confirmed these are the right people to receive it. Future
              months can then send automatically.
            </span>
          </label>
        ) : null}
      </section>

      <section aria-labelledby="l-h" className={box}>
        <h2 id="l-h" className="m-0 text-[15px] font-semibold">
          5 · Private link
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={includeLink} onChange={() => setIncludeLink((v) => !v)} />
          Include a private web link in the email
        </label>
        {includeLink ? (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Expires after
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 border border-border-strong bg-surface px-2 text-[13px] text-ink"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        ) : null}
        <span className="text-xs text-muted">
          Hard-to-guess link, created on send. You can revoke it any time; the emailed PDF is unaffected.
        </span>
      </section>

      <div className="sticky bottom-0 flex flex-col gap-2 border border-ink bg-surface px-4 py-3">
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-down">
            {error}
          </p>
        ) : null}
        {blockers.length ? <p className="m-0 text-[12.5px] text-muted">To send: {blockers.join(" · ")}.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={pending || blockers.length > 0}>
            {pending
              ? "Sending…"
              : `Send ${kind === "preview" ? "preview" : "report"} to ${chosen.length} recipient${chosen.length === 1 ? "" : "s"}`}
          </Button>
          <Link href="/reports" className="self-center text-[13px]">
            Keep as draft
          </Link>
        </div>
      </div>
    </>
  );
}
