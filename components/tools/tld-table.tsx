"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { TextInput } from "@/components/ui/field";

export type TldRow = { tld: string; kind: string; manager: string; expiry: string; href: string };

/** Searchable list of TLDs on /domain-expiry. Every row is in the HTML, so crawlers see them all. */
export function TldTable({ rows }: { rows: TldRow[] }) {
  const id = useId();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase().replace(/^\./, "");
  const shown = query ? rows.filter((r) => r.tld.includes(query) || r.manager.toLowerCase().includes(query)) : rows;
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[13px] font-semibold">
        Find a TLD
      </label>
      <TextInput
        id={id}
        type="search"
        placeholder=".com, .uk, Nominet…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full tbl:max-w-[360px]"
      />
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="sr-only">Top-level domains and whether their expiry dates can be looked up</caption>
          <thead>
            <tr className="text-left text-[11.5px] tracking-[0.03em] text-muted uppercase">
              <th scope="col" className="px-4 py-3 font-normal">
                TLD
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Type
              </th>
              <th scope="col" className="hidden px-4 py-3 font-normal tbl:table-cell">
                Registry
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Expiry date over RDAP
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.tld} className="border-t border-rule align-top">
                <td className="px-4 py-2.5 font-mono">
                  <Link href={r.href}>.{r.tld}</Link>
                </td>
                <td className="px-4 py-2.5 text-ink-2">{r.kind}</td>
                <td className="hidden px-4 py-2.5 text-ink-2 tbl:table-cell">{r.manager}</td>
                <td className="px-4 py-2.5 text-ink-2">{r.expiry}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted">
                  No TLD matches “{q}”. The checker above works for any domain.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
