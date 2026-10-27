"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addIncidentNoteAction } from "./actions";

export function IncidentNoteForm({ incidentId }: { incidentId: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await addIncidentNoteAction(incidentId, note);
      if (!result.ok) return setMessage(result.error);
      setNote("");
      setMessage("Note added");
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label htmlFor="incident-note" className="sr-only">
        Internal note
      </label>
      <textarea
        id="incident-note"
        rows={2}
        maxLength={2000}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setMessage("");
        }}
        placeholder="What you’ve checked or who you’ve contacted"
        className="resize-y border border-border-strong bg-surface p-2 text-[13px]"
      />
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !note.trim()}>
          Add note
        </Button>
        <span aria-live="polite" className="text-[12.5px] text-muted">
          {message}
        </span>
      </div>
    </form>
  );
}
