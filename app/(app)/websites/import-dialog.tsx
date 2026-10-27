"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { csvCell, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/csv";
import type { EvaluatedRow } from "@/lib/data/import";
import { commitImportAction, previewImportAction } from "./actions";

type Step =
  | { kind: "pick" }
  | { kind: "preview"; fileName: string; text: string; rows: EvaluatedRow[] }
  | { kind: "done"; imported: number; rows: EvaluatedRow[] };

const TEMPLATE = "url,name,client\nhttps://clientsite.com,Client Site,Client name\n";
const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

const KIND = {
  ok: { glyph: "●", className: "text-up", weight: "font-normal" },
  warn: { glyph: "▲", className: "text-warn-strong", weight: "font-semibold" },
  err: { glyph: "◆", className: "text-down", weight: "font-semibold" },
} as const;

function skippedCsvHref(rows: EvaluatedRow[]) {
  const lines = [
    "line,url,name,client,problem",
    ...rows
      .filter((r) => r.kind === "err")
      .map((r) => [String(r.line), r.url, r.name, r.client, r.message].map(csvCell).join(",")),
  ];
  return `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join("\n") + "\n")}`;
}

export function ImportDialog({ open, onClose, slotsFree }: { open: boolean; onClose: () => void; slotsFree: number }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [fileError, setFileError] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  const close = () => {
    onClose();
    setStep({ kind: "pick" });
    setFileError("");
    setProblemsOnly(false);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setFileError("");
    if (!/\.csv$/i.test(file.name)) return setFileError(`${file.name} isn’t a .csv file.`);
    if (file.size > MAX_IMPORT_BYTES) return setFileError(`${file.name} is larger than 512 KB.`);
    startTransition(async () => {
      const text = await file.text();
      const result = await previewImportAction(text);
      if (!result.ok) setFileError(result.error);
      else setStep({ kind: "preview", fileName: file.name, text, rows: result.rows });
    });
  };

  const commit = (text: string) =>
    startTransition(async () => {
      const result = await commitImportAction(text);
      if (!result.ok) {
        setFileError(result.error);
        setStep({ kind: "pick" });
        return;
      }
      setStep({ kind: "done", imported: result.imported, rows: result.rows });
      toast.show(`${result.imported} website${result.imported === 1 ? "" : "s"} added`);
    });

  const stepIndex = { pick: 0, preview: 1, done: 2 }[step.kind];
  const counts =
    step.kind === "pick"
      ? null
      : {
          ready: step.rows.filter((r) => r.kind !== "err").length,
          warn: step.rows.filter((r) => r.kind === "warn").length,
          err: step.rows.filter((r) => r.kind === "err").length,
        };

  return (
    <Dialog
      open={open}
      onClose={close}
      width={880}
      title="Import websites from CSV"
      aside={
        <ol aria-label="Import steps" className="m-0 flex list-none gap-3 p-0 text-[12.5px]">
          {["Choose file", "Review rows", "Done"].map((label, i) => (
            <li
              key={label}
              aria-current={i === stepIndex ? "step" : undefined}
              className={i === stepIndex ? "font-semibold text-ink" : "text-muted"}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      }
    >
      {step.kind === "pick" ? (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <label className="flex cursor-pointer flex-col items-center gap-2 border-[1.5px] border-dashed border-faint px-5 py-7 text-center hover:bg-canvas">
            <span className="text-[15px] font-semibold">{pending ? "Checking rows…" : "Choose a CSV file"}</span>
            <span className="text-[13px] text-muted">UTF-8, first row as headers, up to {MAX_IMPORT_ROWS} rows</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={pending}
              onChange={(e) => onFile(e.target.files?.[0])}
              className="text-[13px]"
            />
          </label>
          {fileError ? (
            <div role="alert" className="border border-down-border bg-down-tint px-3 py-2.5 text-[13px] text-down">
              {fileError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-8 gap-y-4 text-[13px] leading-normal">
            <div className="flex flex-[1_1_300px] flex-col gap-1">
              <span className="font-semibold">Columns</span>
              <span>
                <span className="font-mono text-xs">url</span> required — http or https; https is added if missing
              </span>
              <span>
                <span className="font-mono text-xs">name</span> optional display name
              </span>
              <span>
                <span className="font-mono text-xs">client</span> optional — must match an existing client name
              </span>
            </div>
            <div className="flex flex-[1_1_260px] flex-col gap-1">
              <span className="font-semibold">Before importing you’ll see</span>
              <span>
                Every row with its result, duplicates, blocked addresses and plan-limit conflicts. Nothing is added
                until you confirm.
              </span>
            </div>
          </div>
          <a href={templateHref} download="client-status-websites.csv" className="self-start text-[13px]">
            Download template
          </a>
        </div>
      ) : null}

      {step.kind === "preview" && counts ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3 text-[13px]">
            <span className="font-mono text-xs text-muted">{step.fileName}</span>
            <span className="font-semibold text-up">● {counts.ready} ready</span>
            {counts.warn ? <span className="font-semibold text-warn-strong">▲ {counts.warn} with warnings</span> : null}
            <span className="font-semibold text-down">◆ {counts.err} won’t be imported</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={problemsOnly}
                onChange={() => setProblemsOnly((v) => !v)}
                className="size-4"
              />
              Show problems only
            </label>
          </div>
          <div className="min-h-[200px] flex-1 overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                  <th scope="col" className="py-2 pr-2 pl-5 font-normal">
                    ROW
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    URL → HOSTNAME
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    NAME
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    CLIENT
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    RESULT
                  </th>
                </tr>
              </thead>
              <tbody>
                {step.rows
                  .filter((r) => !problemsOnly || r.kind !== "ok")
                  .map((r) => {
                    const k = KIND[r.kind];
                    return (
                      <tr
                        key={r.line}
                        className={`border-b border-rule-soft align-baseline ${r.kind === "err" ? "bg-down-tint/50" : ""}`}
                      >
                        <td className="py-[7px] pr-2 pl-5 font-mono text-xs text-muted">{r.line}</td>
                        <td className="max-w-[300px] px-2 py-[7px]">
                          <span className="flex flex-col">
                            <span className="font-mono text-xs break-all text-ink-2">{r.url || "(empty)"}</span>
                            {r.hostname ? <span className="font-mono text-xs text-muted">→ {r.hostname}</span> : null}
                          </span>
                        </td>
                        <td className="px-2 py-[7px]">{r.name || "—"}</td>
                        <td
                          className={`px-2 py-[7px] ${r.kind === "warn" ? "text-warn-strong" : r.client ? "" : "text-muted"}`}
                        >
                          {r.client || "Unassigned"}
                        </td>
                        <td className={`px-2 py-[7px] ${k.className} ${k.weight}`}>
                          <span aria-hidden="true">{k.glyph}</span> {r.message}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-5 py-3">
            <span className="flex-[1_1_300px] text-[12.5px] text-muted">
              {counts.ready} website{counts.ready === 1 ? "" : "s"} will be added.{" "}
              {Math.max(slotsFree - counts.ready, 0)} plan slots will remain. Rows with problems are skipped — you can
              download them to fix.
            </span>
            <Button variant="secondary" onClick={() => setStep({ kind: "pick" })} disabled={pending}>
              Choose another file
            </Button>
            <Button onClick={() => commit(step.text)} disabled={pending || counts.ready === 0}>
              {pending ? "Importing…" : `Import ${counts.ready} website${counts.ready === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      ) : null}

      {step.kind === "done" && counts ? (
        <div className="flex flex-col gap-2.5 p-5">
          <span className="text-[17px] font-semibold">
            {step.imported} website{step.imported === 1 ? "" : "s"} added
          </span>
          <span className="max-w-[620px] leading-normal text-ink-2">
            They show as Unknown until their first check result arrives.
            {counts.err
              ? ` ${counts.err} row${counts.err === 1 ? " was" : "s were"} skipped — download them to fix and re-import.`
              : ""}
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button onClick={close}>Show websites</Button>
            {counts.err ? (
              <a
                href={skippedCsvHref(step.rows)}
                download="skipped-rows.csv"
                className="flex h-[38px] items-center border border-border-strong bg-surface px-3.5 text-[13px] no-underline"
              >
                Download skipped rows
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
