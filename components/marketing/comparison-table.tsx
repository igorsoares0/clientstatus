import type { ReactNode } from "react";

// Feature comparison for /alternatives and /compare. Yes/No/Partial are spelled out (not just
// glyphs or colour) so they read correctly in screen readers, print and search snippets.

export type ComparisonValue = boolean | "partial" | ReactNode;

export type ComparisonRow = {
  label: string;
  note?: string;
  values: ComparisonValue[];
  /** Optional detail under each value, same order as `values`. */
  notes?: (string | undefined)[];
};

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) return <span className="font-semibold text-up">Yes</span>;
  if (value === false) return <span className="text-muted">No</span>;
  if (value === "partial") return <span className="text-degraded">Partial</span>;
  return <>{value}</>;
}

export function ComparisonTable({
  caption,
  columns,
  rows,
  highlight = 0,
}: {
  caption: string;
  /** Product names, in the same order as each row's values. */
  columns: string[];
  rows: ComparisonRow[];
  /** Column drawn with emphasis (Client Status). */
  highlight?: number;
}) {
  for (const r of rows) {
    if (r.values.length !== columns.length) {
      throw new Error(`ComparisonTable row "${r.label}" has ${r.values.length} values for ${columns.length} columns`);
    }
  }
  const detailed = rows.some((r) => r.notes?.some(Boolean));
  const table = (
    <div className={`border border-border bg-surface ${detailed ? "hidden tbl:block" : ""}`}>
      <table className="w-full border-collapse text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-[11.5px] font-normal tracking-[0.03em] text-muted uppercase"
            >
              Feature
            </th>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`border-l border-rule px-4 py-3 text-left font-semibold ${i === highlight ? "bg-rule-soft" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-rule">
              <th scope="row" className="px-4 py-2.5 text-left align-top font-normal text-ink-2">
                {r.label}
                {r.note ? <span className="block text-[12px] text-muted">{r.note}</span> : null}
              </th>
              {r.values.map((v, i) => (
                <td
                  key={columns[i]}
                  className={`border-l border-rule px-4 py-2.5 align-top ${i === highlight ? "bg-rule-soft" : ""}`}
                >
                  <Cell value={v} />
                  {r.notes?.[i] ? (
                    <span className="mt-1 block text-[12.5px] leading-snug text-muted">{r.notes[i]}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!detailed) return table;
  // Notes don't fit three columns on a phone: one block per feature instead (like PricingTable).
  return (
    <>
      {table}
      <div className="flex flex-col gap-3 tbl:hidden">
        {rows.map((r) => (
          <section key={r.label} aria-label={r.label} className="border border-border bg-surface px-4 py-3.5">
            <h3 className="m-0 text-[14px] font-semibold">{r.label}</h3>
            <dl className="m-0 mt-2 flex flex-col gap-2.5 text-[13.5px]">
              {r.values.map((v, i) => (
                <div key={columns[i]} className="flex flex-col gap-0.5">
                  <dt className="text-[12px] text-muted">{columns[i]}</dt>
                  <dd className="m-0">
                    <Cell value={v} />
                    {r.notes?.[i] ? (
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{r.notes[i]}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
