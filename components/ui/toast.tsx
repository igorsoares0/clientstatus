"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Toasts (design README): bottom-centre, ink, Undo for reversible actions
// (7s), otherwise 3.5s. Announced politely to screen readers.

type Toast = { id: number; message: string; onUndo?: () => void };
type ToastApi = { show: (message: string, onUndo?: () => void) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: string, onUndo?: () => void) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, onUndo });
    timer.current = setTimeout(() => setToast(null), onUndo ? 7000 : 3500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext value={{ show }}>
      {children}
      <div aria-live="polite" className="fixed bottom-10 left-1/2 z-60 -translate-x-1/2">
        {toast ? (
          <div
            key={toast.id}
            className="flex items-center gap-4 bg-ink px-4 py-2.5 text-[13px] text-white shadow-toast"
          >
            <span>{toast.message}</span>
            {toast.onUndo ? (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  setToast(null);
                }}
                className="border-0 bg-transparent p-0 text-[13px] font-semibold whitespace-nowrap text-white underline"
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext>
  );
}
