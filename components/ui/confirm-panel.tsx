import type { ReactNode } from "react";

// Inline confirmation (design "Interactions & behaviour"): destructive or broad
// actions list their concrete consequences before anything happens.

export function ConfirmPanel({
  title,
  points,
  children,
  actions,
  label,
}: {
  title: string;
  points: ReactNode[];
  children?: ReactNode;
  actions: ReactNode;
  label: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex max-w-[680px] flex-col gap-2.5 border border-border-strong bg-canvas px-3.5 py-3"
    >
      <span className="font-semibold">{title}</span>
      <ul className="m-0 flex flex-col gap-0.5 pl-[18px] text-[13px] leading-normal text-ink-2">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      {children}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
