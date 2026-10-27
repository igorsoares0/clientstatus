import { describe, expect, it } from "vitest";
import { csvCell, MAX_IMPORT_ROWS, parseCsvRecords, parseImportCsv } from "@/lib/csv";

describe("parseCsvRecords", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines, CRLF and BOM", () => {
    const text = '﻿url,name\r\nexample.com,"Smith, Jones & ""Co"""\r\n"a.com","line\nbreak"\r\n\r\n';
    expect(parseCsvRecords(text)).toEqual([
      ["url", "name"],
      ["example.com", 'Smith, Jones & "Co"'],
      ["a.com", "line\nbreak"],
    ]);
  });
});

describe("parseImportCsv", () => {
  it("maps columns case-insensitively and numbers lines from the header", () => {
    const r = parseImportCsv("Client,URL,Name\nHarbour,harbourdental.co.uk,Harbour Dental\n,shop.example.com,\n");
    expect(r).toEqual({
      ok: true,
      rows: [
        { line: 2, url: "harbourdental.co.uk", name: "Harbour Dental", client: "Harbour" },
        { line: 3, url: "shop.example.com", name: "", client: "" },
      ],
    });
  });

  it("explains files it can't use", () => {
    expect(parseImportCsv("")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseImportCsv("name,client\nA,B")).toEqual({ ok: false, error: "No “url” column found in the first row." });
    expect(parseImportCsv("url\n")).toEqual({ ok: false, error: "The file has headers but no rows." });
    const big = "url\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `s${i}.example.com`).join("\n");
    expect(parseImportCsv(big)).toMatchObject({ ok: false, error: expect.stringContaining("Import up to 500") });
  });
});

describe("csvCell", () => {
  it("quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});
