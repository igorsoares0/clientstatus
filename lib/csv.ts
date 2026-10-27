// Minimal RFC 4180 CSV parser for website imports: quoted fields, escaped
// quotes (""), commas and newlines inside quotes, CRLF, and a UTF-8 BOM.

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 512 * 1024;

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRow = {
  /** 1-based line number in the file, counting the header as line 1. */
  line: number;
  url: string;
  name: string;
  client: string;
};

export type ParsedImport = { ok: true; rows: ImportRow[] } | { ok: false; error: string };

export function parseImportCsv(text: string): ParsedImport {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "The file is larger than 512 KB." };
  }
  const records = parseCsvRecords(text);
  if (records.length === 0) return { ok: false, error: "The file is empty." };

  const header = records[0].map((h) => h.trim().toLowerCase());
  const iu = header.indexOf("url");
  const inm = header.indexOf("name");
  const ic = header.indexOf("client");
  if (iu < 0) return { ok: false, error: "No “url” column found in the first row." };

  const body = records.slice(1);
  if (body.length === 0) return { ok: false, error: "The file has headers but no rows." };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `The file has ${body.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.` };
  }

  return {
    ok: true,
    rows: body.map((cells, i) => ({
      line: i + 2,
      url: (cells[iu] ?? "").trim(),
      name: inm >= 0 ? (cells[inm] ?? "").trim() : "",
      client: ic >= 0 ? (cells[ic] ?? "").trim() : "",
    })),
  };
}

/** Quote a value for CSV output (used for the skipped-rows download). */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
