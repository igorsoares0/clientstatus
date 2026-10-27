"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { REPORT_STATUS } from "@/lib/reports/status";
import { generatePreviewAction } from "../../reports/actions";

type Row = {
  id: string;
  label: string;
  kind: string;
  status: keyof typeof REPORT_STATUS;
  sentAt: string | null;
  gaps: number;
};

export function ClientReports({
  clientId,
  canManage,
  reports,
}: {
  clientId: string;
  canManage: boolean;
  reports: Row[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preview = () =>
    startTransition(async () => {
      const r = await generatePreviewAction(clientId);
      if (!r.ok) return toast.show(r.error);
      toast.show("Generating a preview of this month so far…");
      router.push(`/reports/${r.reportId}`);
    });

  return (
    <div className="flex flex-col border border-border bg-surface">
      {reports.length === 0 ? (
        <p className="m-0 px-4 py-3.5 text-[13.5px] leading-normal text-muted">
          No reports yet. Monthly reports are generated on the 1st; the first one covers only the monitored part of the
          month and is labelled as partial.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {reports.map((r) => {
            const s = REPORT_STATUS[r.status];
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 text-[13.5px] last:border-0"
              >
                <Link href={`/reports/${r.id}`} className="font-semibold">
                  {r.label}
                  {r.kind === "preview" ? " · preview" : ""}
                </Link>
                <span className="text-[13px] text-muted">
                  {r.gaps ? `${r.gaps} gap${r.gaps === 1 ? "" : "s"} disclosed` : "Complete data"}
                </span>
                <span className={`ml-auto text-[13px] ${s.cls}`}>
                  <span aria-hidden="true">{s.glyph}</span> {r.sentAt ? `Sent ${r.sentAt}` : s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-2.5">
          <Button size="sm" variant="secondary" onClick={preview} disabled={pending}>
            {pending ? "Starting…" : "Generate preview now"}
          </Button>
          <span className="text-xs text-muted">Covers this month so far. Previews are never sent automatically.</span>
        </div>
      ) : null}
    </div>
  );
}
