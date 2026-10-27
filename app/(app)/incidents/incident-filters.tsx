"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "@/components/ui/icons";

type Counts = { open: number; acknowledged: number; muted: number; resolved: number };

const selectClass = "h-[34px] border border-border-strong bg-surface px-2 text-[13px] text-ink";

export function IncidentFilters({ counts }: { counts: Counts }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v && v !== "all") next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const state = params.get("state") ?? "all";
  const tabs = [
    ["all", "All", counts.open + counts.acknowledged + counts.muted + counts.resolved],
    ["open", "Open", counts.open],
    ["acknowledged", "Acknowledged", counts.acknowledged],
    ["muted", "Muted", counts.muted],
    ["resolved", "Resolved", counts.resolved],
  ] as const;

  return (
    <div role="search" aria-label="Filter incidents" className="flex flex-col gap-2">
      <div role="group" aria-label="State" className="flex flex-wrap border border-border-strong bg-surface">
        {tabs.map(([v, l, n]) => (
          <button
            key={v}
            type="button"
            aria-pressed={state === v}
            onClick={() => update({ state: v })}
            className={`flex h-8 items-center gap-1.5 border-0 px-3 text-[13px] ${state === v ? "bg-ink text-white" : "bg-surface text-ink"}`}
          >
            {l} <span className="font-mono text-xs opacity-80">{n}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex flex-[1_1_200px]">
          <span className="sr-only">Search incidents</span>
          <span className="pointer-events-none absolute top-1/2 left-2.5 -mt-[7.5px] text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search title, website or client"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => update({ q: v.trim() }), 300);
            }}
            className="h-[34px] w-full border border-border-strong bg-surface pr-2.5 pl-8 text-[13px]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <span className="sr-only">Severity</span>
          <select
            value={params.get("severity") ?? ""}
            onChange={(e) => update({ severity: e.target.value })}
            className={selectClass}
          >
            <option value="">Any severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <span className="sr-only">Type</span>
          <select
            value={params.get("type") ?? ""}
            onChange={(e) => update({ type: e.target.value })}
            className={selectClass}
          >
            <option value="">Any type</option>
            <option value="downtime">Downtime</option>
            <option value="ssl_invalid">SSL invalid</option>
            <option value="ssl_expiry">SSL expiry</option>
            <option value="domain_expiry">Domain expiry</option>
            <option value="audit_issue">Audit</option>
          </select>
        </label>
      </div>
    </div>
  );
}
