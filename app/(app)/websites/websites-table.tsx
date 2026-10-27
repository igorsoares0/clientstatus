"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusGlyph } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import type { CellView, SiteStatusView } from "@/lib/site-status";
import { setSitesPausedAction } from "./actions";

export type SiteRow = {
  id: string;
  name: string;
  hostname: string;
  https: boolean;
  client: { id: string; name: string } | null;
  state: "active" | "paused" | "archived";
  view: SiteStatusView;
  uptime: { text: string; title: string; low: boolean };
  response: string;
  ssl: CellView;
  domain: CellView;
  incidents: number;
  audit: { text: string; sub: string; warn: boolean } | null;
  lastCheck: { text: string; title: string; stale: boolean };
};

export type SortHeader = {
  key: string;
  label: string;
  href: string;
  ariaSort: "ascending" | "descending" | "none";
  arrow: string;
};

type Confirm = { kind: "pause" | "resume"; ids: string[]; skipped: number };

function plural(n: number, word = "website") {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function WebsitesTable({
  rows,
  sortHeaders,
  matchText,
  slotsFree,
  maxSites,
  planName,
  clearFiltersHref,
}: {
  rows: SiteRow[];
  sortHeaders: Record<"name" | "client" | "status", SortHeader>;
  matchText: string;
  slotsFree: number;
  maxSites: number;
  planName: string;
  clearFiltersHref: string | null;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pageAllRef = useRef<HTMLInputElement>(null);

  // Drop selections that are no longer on the page (after filtering or paging).
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const sel = useMemo(() => new Set([...selected].filter((id) => visibleIds.has(id))), [selected, visibleIds]);
  const selRows = rows.filter((r) => sel.has(r.id));
  const pausable = selRows.filter((r) => r.state === "active");
  const resumable = selRows.filter((r) => r.state === "paused");
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));

  useEffect(() => {
    if (pageAllRef.current) pageAllRef.current.indeterminate = sel.size > 0 && !allOnPage;
  }, [sel.size, allOnPage]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (kind: "pause" | "resume", ids: string[], undoable: boolean) =>
    startTransition(async () => {
      const result = await setSitesPausedAction(ids, kind === "pause");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirm(null);
      setSelected(new Set());
      setError(null);
      const n = result.changed.length;
      const message =
        kind === "pause" ? `Paused ${plural(n)} · history kept` : `Resumed ${plural(n)} · awaiting first check`;
      const opposite = kind === "pause" ? "resume" : "pause";
      toast.show(message, undoable && n > 0 ? () => run(opposite, result.changed, false) : undefined);
    });

  const ask = (kind: "pause" | "resume") => {
    const targets = kind === "pause" ? pausable : resumable;
    if (targets.length === 0) {
      toast.show(
        kind === "pause" ? "All selected websites are already paused." : "None of the selected websites are paused.",
      );
      return;
    }
    setError(null);
    setConfirm({ kind, ids: targets.map((t) => t.id), skipped: selRows.length - targets.length });
  };

  const confirmRows = confirm ? rows.filter((r) => confirm.ids.includes(r.id)) : [];
  const over = confirm?.kind === "resume" ? confirm.ids.length - Math.max(slotsFree, 0) : 0;

  return (
    <section aria-label="Websites" className="flex min-w-0 flex-col border border-border bg-surface">
      <div
        className={`flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 ${
          sel.size ? "bg-ink text-white" : "bg-surface"
        }`}
      >
        {sel.size ? (
          <>
            <span aria-live="polite" className="font-semibold tabular">
              {sel.size} selected
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => ask("pause")}
              className={`h-[30px] border border-white bg-white px-3 text-[12.5px] font-semibold whitespace-nowrap text-ink ${pausable.length === 0 ? "opacity-55" : ""}`}
            >
              Pause monitoring…
            </button>
            <button
              type="button"
              onClick={() => ask("resume")}
              className={`h-[30px] border border-faint bg-transparent px-3 text-[12.5px] whitespace-nowrap text-white ${resumable.length === 0 ? "opacity-55" : ""}`}
            >
              Resume monitoring…
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-[30px] border-0 bg-transparent px-2 text-[12.5px] whitespace-nowrap text-bar-text underline"
            >
              Clear selection
            </button>
          </>
        ) : (
          <>
            <span aria-live="polite" className="text-[13px] text-muted tabular">
              {matchText}
            </span>
            <span className="flex-1" />
            {rows.length ? <span className="text-xs text-muted">Select rows to pause or resume monitoring</span> : null}
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 px-3 py-6">
          <span className="font-semibold">No websites match these filters</span>
          {clearFiltersHref ? (
            <Link href={clearFiltersHref} className="self-start text-[13px]">
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {/* < 720px: stacked rows */}
          <ul aria-label="Websites" className="m-0 list-none p-0 tbl:hidden">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 gap-y-1 border-b border-rule px-3 py-2.5 ${sel.has(r.id) ? "bg-row-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={sel.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.name}`}
                  className="mt-0.5 size-[18px]"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    href={`/websites/${r.id}`}
                    className="truncate text-sm font-semibold decoration-no-data underline-offset-[3px]"
                  >
                    {r.name}
                  </Link>
                  <span className="truncate font-mono text-xs text-muted">{r.hostname}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] whitespace-nowrap tabular">
                    <StatusGlyph status={r.view.status} label={r.view.label} />
                    <span>{r.uptime.text}</span>
                    <span className={`${TONE[r.ssl.tone]} ${r.ssl.strong ? "font-semibold" : ""}`}>
                      SSL {r.ssl.text}
                    </span>
                    <span className={`font-mono text-xs ${r.lastCheck.stale ? "text-degraded" : "text-muted"}`}>
                      {r.lastCheck.text}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* ≥ 720px: table with sticky header and name column */}
          <div className="hidden overflow-x-auto tbl:block">
            <table className="w-full min-w-[1150px] border-collapse text-[13px] tabular">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                  <th scope="col" className="sticky left-0 w-10 bg-surface">
                    <span className="flex h-9 items-center justify-center">
                      <input
                        ref={pageAllRef}
                        type="checkbox"
                        checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
                        aria-label="Select all websites on this page"
                        className="size-4"
                      />
                    </span>
                  </th>
                  <SortTh header={sortHeaders.name} className="sticky left-10 min-w-[260px] bg-surface" />
                  <SortTh header={sortHeaders.client} className="min-w-[150px]" />
                  <SortTh header={sortHeaders.status} className="w-[150px]" />
                  <PlainTh label="UPTIME 30 D" right />
                  <PlainTh label="RESPONSE" right />
                  <PlainTh label="SSL" right />
                  <PlainTh label="DOMAIN" right />
                  <PlainTh label="INC." right />
                  <PlainTh label="LAST AUDIT" right />
                  <PlainTh label="LAST CHECK" right />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = sel.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      aria-selected={isSel}
                      className={`border-b border-rule hover:bg-row-hover ${isSel ? "bg-row-selected" : "bg-surface"}`}
                    >
                      <td
                        className={`sticky left-0 bg-inherit ${isSel ? "shadow-[inset_3px_0_0_var(--color-ink)]" : ""}`}
                      >
                        <span className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggle(r.id)}
                            aria-label={`Select ${r.name}`}
                            className="size-4"
                          />
                        </span>
                      </td>
                      <td className="sticky left-10 max-w-[360px] border-r border-rule-soft bg-inherit px-2 py-1.5">
                        <span className="flex min-w-0 flex-col">
                          <Link
                            href={`/websites/${r.id}`}
                            title={r.name}
                            className="truncate text-[13.5px] font-semibold decoration-no-data underline-offset-[3px] hover:decoration-ink"
                          >
                            {r.name}
                          </Link>
                          <span title={r.hostname} className="truncate font-mono text-xs text-muted">
                            {r.hostname}
                          </span>
                        </span>
                      </td>
                      <td className={`max-w-[220px] truncate px-2 ${r.client ? "" : "text-muted"}`}>
                        {r.client ? (
                          <Link href={`/clients/${r.client.id}`} className="no-underline hover:underline">
                            {r.client.name}
                          </Link>
                        ) : (
                          "Unassigned"
                        )}
                      </td>
                      <td className="px-2 leading-[1.3]">
                        <span className="flex flex-col">
                          <StatusGlyph status={r.view.status} label={r.view.label} />
                          {r.view.sub ? <span className="text-xs text-muted">{r.view.sub}</span> : null}
                        </span>
                      </td>
                      <td
                        className={`px-2 text-right ${r.uptime.low ? "font-semibold text-degraded" : r.uptime.text === "—" ? "text-faint" : ""}`}
                        title={r.uptime.title}
                      >
                        {r.uptime.text}
                      </td>
                      <td className={`px-2 text-right ${r.response === "—" ? "text-faint" : ""}`}>{r.response}</td>
                      <ValueCell cell={r.ssl} />
                      <ValueCell cell={r.domain} />
                      <td className="px-2 text-right">
                        {r.incidents ? (
                          <Link
                            href={`/incidents?site=${r.id}`}
                            aria-label={`${r.incidents} open incident${r.incidents === 1 ? "" : "s"}`}
                            className="font-semibold text-down"
                          >
                            {r.incidents}
                          </Link>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-2 text-right leading-[1.3]">
                        {r.audit ? (
                          <span className="flex flex-col items-end">
                            <span>{r.audit.text}</span>
                            <span className={`text-xs ${r.audit.warn ? "text-degraded" : "text-muted"}`}>
                              {r.audit.sub}
                            </span>
                          </span>
                        ) : (
                          <span className="text-faint" title="No audit yet">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-2 text-right font-mono text-xs ${r.lastCheck.stale ? "font-semibold text-degraded" : "text-muted"}`}
                        title={r.lastCheck.title}
                      >
                        {r.lastCheck.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        role="alertdialog"
        width={560}
        title={
          confirm
            ? `${confirm.kind === "pause" ? "Pause" : "Resume"} monitoring for ${plural(confirm.ids.length)}?`
            : ""
        }
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)} autoFocus>
                Cancel
              </Button>
              <Button onClick={() => run(confirm.kind, confirm.ids, true)} disabled={pending || over > 0}>
                {pending ? "Saving…" : `${confirm.kind === "pause" ? "Pause" : "Resume"} ${plural(confirm.ids.length)}`}
              </Button>
            </>
          ) : null
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-3.5 px-5 py-4">
            {confirm.skipped ? (
              <span className="text-[13px] text-muted">
                {plural(confirm.skipped, "selected website")} {confirm.skipped === 1 ? "is" : "are"} already{" "}
                {confirm.kind === "pause" ? "paused" : "monitored"} and won’t change.
              </span>
            ) : null}
            <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-[13.5px] leading-[1.45] text-ink-2">
              {confirm.kind === "pause" ? (
                <>
                  <li>Uptime, SSL and domain checks stop, and scheduled audits are skipped.</li>
                  <li>No alerts are sent while paused.</li>
                  <li>All history is kept. Reports will show the paused time as a monitoring gap, not as uptime.</li>
                  <li>
                    Frees {confirm.ids.length} of your {maxSites} plan slots. You can resume at any time.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    Checks restart once monitoring is running. Status shows Unknown until each first result arrives.
                  </li>
                  <li>The paused period stays recorded as a gap in history and reports.</li>
                  <li>
                    Uses {confirm.ids.length} of your {Math.max(slotsFree, 0)} free plan slot
                    {slotsFree === 1 ? "" : "s"}.
                  </li>
                </>
              )}
            </ul>
            {over > 0 ? (
              <div
                role="alert"
                className="border border-down-border bg-down-tint px-3 py-2.5 text-[13px] leading-[1.45] text-down"
              >
                Only {Math.max(slotsFree, 0)} slot{slotsFree === 1 ? " is" : "s are"} free on {planName} ({maxSites}{" "}
                sites). Deselect {plural(over)} or upgrade your plan to resume all of them.
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="border border-down-border bg-down-tint px-3 py-2.5 text-[13px] text-down">
                {error}
              </div>
            ) : null}
            <div className="max-h-40 overflow-y-auto border border-rule">
              <div className="sticky top-0 border-b border-rule bg-surface px-2.5 py-1.5 text-xs tracking-[.03em] text-muted">
                AFFECTED WEBSITES · {confirm.ids.length}
              </div>
              {confirmRows.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between gap-3 border-b border-rule-soft px-2.5 py-1 text-[12.5px]"
                >
                  <span className="truncate font-mono">{r.hostname}</span>
                  <span className="whitespace-nowrap text-muted">{r.client?.name ?? "Unassigned"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function SortTh({
  header,
  className = "",
  right = false,
}: {
  header: SortHeader;
  className?: string;
  right?: boolean;
}) {
  const on = header.ariaSort !== "none";
  return (
    <th scope="col" aria-sort={header.ariaSort} className={`px-2 font-normal ${className}`}>
      <Link
        href={header.href}
        scroll={false}
        className={`flex h-9 items-center gap-1 whitespace-nowrap no-underline hover:text-ink ${right ? "justify-end" : ""} ${
          on ? "font-semibold text-ink" : "text-muted"
        }`}
      >
        {header.label}
        <span aria-hidden="true" className="w-2 text-[10px]">
          {header.arrow}
        </span>
      </Link>
    </th>
  );
}

function PlainTh({ label, right = false }: { label: string; right?: boolean }) {
  return (
    <th scope="col" className={`px-2 font-normal whitespace-nowrap ${right ? "text-right" : ""}`}>
      {label}
    </th>
  );
}

const TONE = { ink: "", muted: "text-muted", degraded: "text-degraded", down: "text-down" } as const;

function ValueCell({ cell }: { cell: CellView }) {
  return (
    <td className={`px-2 text-right ${TONE[cell.tone]} ${cell.strong ? "font-semibold" : ""}`} title={cell.title}>
      {cell.text}
    </td>
  );
}
