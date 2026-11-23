"use client";

import type { ReactNode } from "react";

// Client helpers for the free tools: one JSON POST per check and small result building blocks.

export type ToolResponse<T> = { ok: true; result?: T; runId?: string | null } | { ok: false; error: string };

export async function postTool<T>(path: string, body: Record<string, unknown>): Promise<ToolResponse<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as ToolResponse<T> | null;
    if (data && typeof data === "object" && "ok" in data) return data;
    return { ok: false, error: `Something went wrong (HTTP ${res.status}). Try again.` };
  } catch {
    return { ok: false, error: "Couldn’t reach our server. Check your connection and try again." };
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export type Tone = "ok" | "warn" | "bad" | "muted";

const TONE: Record<Tone, string> = {
  ok: "text-up",
  warn: "text-degraded",
  bad: "text-down",
  muted: "text-muted",
};
const GLYPH: Record<Tone, string> = { ok: "●", warn: "▲", bad: "◆", muted: "○" };

/** Big status line at the top of a result: glyph + word in a status colour, then the detail. */
export function Verdict({ tone, label, children }: { tone: Tone; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`m-0 text-[20px] font-semibold ${TONE[tone]}`}>
        <span aria-hidden="true">{GLYPH[tone]} </span>
        {label}
      </p>
      {children ? <p className="m-0 text-[14.5px] text-ink-2">{children}</p> : null}
    </div>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-rule pt-4 text-[14px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResultBox({ children }: { children: ReactNode }) {
  return (
    <section aria-live="polite" className="flex flex-col gap-4 border border-border bg-surface px-5 py-5">
      {children}
    </section>
  );
}
