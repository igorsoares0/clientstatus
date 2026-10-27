"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateClientNotesAction } from "../actions";

export function ClientNotes({ clientId, initial, canEdit }: { clientId: string; initial: string; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [notes, setNotes] = useState(initial);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <p className="m-0 text-[13.5px] whitespace-pre-wrap text-ink-2">
        {initial || <span className="text-muted">No notes.</span>}
      </p>
    );
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateClientNotesAction(clientId, notes);
      if (!result.ok) return setNote(result.error);
      setSaved(notes);
      setNote("Saved");
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label htmlFor="client-notes" className="sr-only">
        Internal notes
      </label>
      <textarea
        id="client-notes"
        rows={5}
        maxLength={5000}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setNote("");
        }}
        className="resize-y border border-border-strong bg-surface p-2.5 text-[13.5px] leading-normal"
      />
      <div className="flex items-center gap-2.5">
        <Button type="submit" size="sm" disabled={pending || notes === saved}>
          Save notes
        </Button>
        <span aria-live="polite" className="text-[12.5px] text-muted">
          {note}
        </span>
      </div>
    </form>
  );
}
