"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { useToast } from "@/components/ui/toast";
import { revokeLinkAction, rotateLinkAction, sendReportAction } from "../actions";

const box = "flex flex-col gap-2 border border-border bg-surface px-4 py-3.5";
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Queued", cls: "text-muted" },
  sent: { label: "● Delivered to provider", cls: "text-up" },
  failed: { label: "◆ Failed", cls: "text-down" },
  bounced: { label: "◆ Bounced", cls: "text-down" },
  suppressed: { label: "Not sent", cls: "text-muted" },
};

export function SentPanel({
  reportId,
  canManage,
  linkDays,
  link,
  deliveries,
  disclosures,
  recipients,
}: {
  reportId: string;
  canManage: boolean;
  linkDays: number;
  link: { exists: boolean; revoked: boolean; expiresAt: string | null; expired: boolean };
  deliveries: { email: string; status: string; at: string | null }[];
  disclosures: string[];
  recipients: { id: string; email: string; confirmed: boolean }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [newLink, setNewLink] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = link.exists && !link.revoked && !link.expired;

  const rotate = () =>
    startTransition(async () => {
      const r = await rotateLinkAction(reportId, linkDays);
      if (!r.ok) return setError(r.error);
      setNewLink(r.link);
      toast.show("New private link created — the old one no longer works");
    });
  const revoke = () =>
    startTransition(async () => {
      const r = await revokeLinkAction(reportId);
      if (!r.ok) return setError(r.error);
      setConfirmRevoke(false);
      setNewLink(null);
      toast.show("Link revoked");
    });
  const resend = () =>
    startTransition(async () => {
      const ids = recipients.filter((r) => r.confirmed && deliveries.some((d) => d.email === r.email)).map((r) => r.id);
      const r = await sendReportAction(reportId, {
        recipientIds: ids,
        confirmRecipients: false,
        includeLink: false,
        linkDays,
      });
      if (!r.ok) return setError(r.error);
      toast.show(`Resent to ${r.sent} recipient${r.sent === 1 ? "" : "s"} (PDF only)`);
      router.refresh();
    });

  return (
    <>
      <section aria-labelledby="d-h" className={box}>
        <h2 id="d-h" className="m-0 text-[15px] font-semibold">
          Delivery
        </h2>
        {deliveries.map((d, i) => (
          <div key={`${d.email}-${i}`} className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="font-mono text-xs">{d.email}</span>
            <span className={`text-xs ${STATUS[d.status]?.cls ?? ""}`}>
              {STATUS[d.status]?.label ?? d.status}
              {d.at ? ` · ${d.at}` : ""}
            </span>
          </div>
        ))}
        {canManage && deliveries.length ? (
          <Button size="sm" variant="secondary" onClick={resend} disabled={pending} className="self-start">
            Resend PDF
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="l-h" className={box}>
        <h2 id="l-h" className="m-0 text-[15px] font-semibold">
          Private link
        </h2>
        <p className="m-0 text-[13px] text-ink-2">
          {!link.exists
            ? "No link was included."
            : link.revoked
              ? "Revoked — it no longer opens."
              : link.expired
                ? "Expired."
                : `Active until ${link.expiresAt}.`}
        </p>
        {newLink ? (
          <>
            <span className="text-xs text-muted">Copy it now; for security it can’t be shown again:</span>
            <input
              readOnly
              value={newLink}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 border border-border-strong px-2 font-mono text-xs"
              aria-label="Private report link"
            />
          </>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={rotate} disabled={pending}>
              {link.exists ? "Create new link" : "Create link"}
            </Button>
            {active ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmRevoke(true)}
                aria-expanded={confirmRevoke}
              >
                Revoke…
              </Button>
            ) : null}
          </div>
        ) : null}
        {confirmRevoke ? (
          <ConfirmPanel
            label="Confirm revoke"
            title="Revoke the private link?"
            points={[
              "Anyone opening it sees “link unavailable”.",
              "The PDF already emailed keeps working.",
              "You can create a new link later.",
            ]}
            actions={
              <>
                <Button size="sm" variant="destructive" onClick={revoke} disabled={pending}>
                  Revoke link
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmRevoke(false)}>
                  Cancel
                </Button>
              </>
            }
          />
        ) : null}
      </section>

      {disclosures.length ? (
        <section aria-labelledby="x-h" className={box}>
          <h2 id="x-h" className="m-0 text-[15px] font-semibold">
            Disclosed in this report
          </h2>
          <ul className="m-0 pl-[18px] text-[13px] text-ink-2">
            {disclosures.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-down">
          {error}
        </p>
      ) : null}
    </>
  );
}
