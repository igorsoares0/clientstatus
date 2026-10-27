"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Modal built on <dialog>: the browser handles focus trapping, Esc and inert
// background. Square corners, modal shadow, ink backdrop (design README).

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Right side of the title bar, e.g. "84 of 100 slots free". */
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  role?: "dialog" | "alertdialog";
};

export function Dialog({ open, onClose, title, aside, children, footer, width = 520, role = "dialog" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ width, maxWidth: "calc(100% - 32px)" }}
      className="m-auto mt-[10vh] max-h-[84vh] flex-col border border-border-strong bg-surface p-0 text-ink shadow-modal backdrop:bg-[rgba(22,26,28,.36)] open:flex"
    >
      <div className="flex items-baseline gap-3 border-b border-border px-5 py-4">
        <h2 id={titleId} className="m-0 text-lg font-semibold font-stretch-85%">
          {title}
        </h2>
        {aside ? <span className="ml-auto text-xs text-muted">{aside}</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      ) : null}
    </dialog>
  );
}
