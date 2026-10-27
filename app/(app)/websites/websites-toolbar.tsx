"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "@/components/ui/icons";

type Option = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Monitored" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

/** Filters live in the URL so views are shareable and survive reloads. */
export function WebsitesToolbar({
  q,
  client,
  status,
  clients,
  filtersOn,
}: {
  q: string;
  client: string;
  status: string;
  clients: Option[];
  filtersOn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v && v !== "all") next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div role="search" aria-label="Filter websites" className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
      <label className="relative flex max-w-[340px] flex-[1_1_240px]">
        <span className="sr-only">Search websites</span>
        <span className="pointer-events-none absolute top-1/2 left-2.5 -mt-[7.5px] text-muted">
          <SearchIcon />
        </span>
        <input
          type="search"
          placeholder="Search name, hostname or client"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update({ q: value.trim() }), 300);
          }}
          className="h-[34px] w-full border border-border-strong bg-surface pr-2.5 pl-8 text-[13px]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-muted">
        Client
        <select
          value={client}
          onChange={(e) => update({ client: e.target.value })}
          className="h-[34px] max-w-[200px] border border-border-strong bg-surface px-2 text-[13px] text-ink"
        >
          <option value="">All clients</option>
          <option value="unassigned">Unassigned</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-muted">
        Status
        <select
          value={status}
          onChange={(e) => update({ status: e.target.value })}
          className="h-[34px] border border-border-strong bg-surface px-2 text-[13px] text-ink"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {filtersOn ? (
        <Link href="/websites" onClick={() => setQuery("")} className="px-1.5 text-[13px]">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
