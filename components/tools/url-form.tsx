"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

/** One-field form used by the SSL, domain and broken-link tools. */
export function UrlForm({
  label,
  placeholder,
  button,
  pending,
  error,
  defaultValue = "",
  onSubmit,
  children,
}: {
  label: string;
  placeholder: string;
  button: string;
  pending: boolean;
  error: string | null;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  children?: ReactNode;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <div className="flex flex-col gap-2 tbl:flex-row">
        <TextInput
          id={id}
          name="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          invalid={!!error}
          aria-describedby={`${id}-msg`}
          className="w-full tbl:max-w-[440px]"
          mono
        />
        <Button type="submit" size="lg" disabled={pending || !value.trim()}>
          {pending ? "Checking…" : button}
        </Button>
      </div>
      {children}
      <p id={`${id}-msg`} aria-live="polite" className="m-0 min-h-[1.25em] text-[12.5px] text-down">
        {error}
      </p>
    </form>
  );
}
