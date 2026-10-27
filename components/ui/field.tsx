import type { ComponentProps, ReactNode } from "react";

// Label-wrapped field matching the Onboarding design: 13px/600 label, 40px
// input with 1px border-strong (down when invalid), 12.5px message below.

type Tone = "muted" | "error" | "ok";

const toneClass: Record<Tone, string> = { muted: "text-muted", error: "text-down", ok: "text-up" };

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  message?: string;
  messageTone?: Tone;
  messageId?: string;
  children: ReactNode;
};

export function Field({ label, hint, message, messageTone = "error", messageId, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
      <span>
        {label}
        {hint ? <span className="font-normal text-muted"> {hint}</span> : null}
      </span>
      {children}
      <span id={messageId} aria-live="polite" className={`text-[12.5px] font-normal ${toneClass[messageTone]}`}>
        {message}
      </span>
    </label>
  );
}

type TextInputProps = ComponentProps<"input"> & { invalid?: boolean; mono?: boolean };

export function TextInput({ invalid = false, mono = false, className = "", ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid}
      className={`h-10 border bg-surface px-2.5 text-sm font-normal ${invalid ? "border-down" : "border-border-strong"} ${mono ? "font-mono" : ""} ${className}`}
      {...props}
    />
  );
}

type SelectProps = ComponentProps<"select">;

export function Select({ className = "", ...props }: SelectProps) {
  return (
    <select
      className={`h-10 border border-border-strong bg-surface px-2 text-sm font-normal ${className}`}
      {...props}
    />
  );
}

/** Form-level error, e.g. "Email or password is incorrect." */
export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="border border-down-border bg-down-tint px-3.5 py-2.5 text-[13px] text-down">
      {children}
    </div>
  );
}
