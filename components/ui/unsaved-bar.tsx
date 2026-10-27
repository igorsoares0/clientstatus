"use client";

import { Button } from "@/components/ui/button";

/** Sticky dark bar listing what changed (design "Settings"). */
export function UnsavedBar({
  changes,
  onSave,
  onDiscard,
  pending,
  blocked,
}: {
  changes: string[];
  onSave: () => void;
  onDiscard: () => void;
  pending: boolean;
  blocked?: string | null;
}) {
  if (!changes.length) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 bg-ink px-4 py-2.5 text-[13px] text-white shadow-toast"
    >
      <span className="min-w-0 flex-1">
        <b>Unsaved changes:</b> {changes.join(" · ")}
        {blocked ? <span className="block text-bar-delayed">▲ {blocked}</span> : null}
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="border-0 bg-transparent p-0 text-[13px] text-bar-text underline"
      >
        Discard
      </button>
      <Button size="sm" variant="secondary" onClick={onSave} disabled={pending || Boolean(blocked)}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
