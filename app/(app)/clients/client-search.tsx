"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "@/components/ui/icons";

export function ClientSearch({ q }: { q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <label className="relative flex max-w-[340px] flex-[1_1_240px]">
      <span className="sr-only">Search clients</span>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -mt-[7.5px] text-muted">
        <SearchIcon />
      </span>
      <input
        type="search"
        placeholder="Search client, contact or website"
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const next = new URLSearchParams(params.toString());
            if (value.trim()) next.set("q", value.trim());
            else next.delete("q");
            const qs = next.toString();
            startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
          }, 300);
        }}
        className="h-[34px] w-full border border-border-strong bg-surface pr-2.5 pl-8 text-[13px]"
      />
    </label>
  );
}
