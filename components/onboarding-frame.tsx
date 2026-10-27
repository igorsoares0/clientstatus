import type { ReactNode } from "react";

// Shell for sign-in and onboarding screens (Onboarding.dc.html header + centred 560px column).

const STEPS = ["Account", "Workspace", "First website", "Monitoring"] as const;
export type OnboardingStep = (typeof STEPS)[number];

export function OnboardingFrame({ step, children }: { step?: OnboardingStep; children: ReactNode }) {
  const current = step ? STEPS.indexOf(step) : -1;
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-7 py-3.5">
        <span className="text-[17px] font-bold font-stretch-80%">Client Status</span>
        {step ? (
          <ol aria-label="Setup steps" className="m-0 ml-auto flex list-none flex-wrap gap-1 p-0">
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === current ? "step" : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-2.5 py-1 text-[12.5px] whitespace-nowrap ${
                  i === current ? "border-ink font-semibold" : "border-transparent"
                } ${i <= current ? "text-ink" : "text-muted"}`}
              >
                <span className="font-mono">{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        ) : null}
      </header>
      <main className="flex flex-1 justify-center px-5 pt-10 pb-15">
        <div className="flex w-full max-w-[560px] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}

/** White panel with title block, body and footer sections separated by rules. */
export function Panel({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col border border-border bg-surface">
      <div className="flex flex-col gap-1.5 px-6 pt-[22px] pb-1.5">
        <h1 className="m-0 text-2xl font-semibold font-stretch-84%">{title}</h1>
        {intro ? <p className="m-0 leading-normal text-ink-2">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-col gap-3.5 px-6 py-4">{children}</div> : null}
      {footer ? <div className="flex flex-col gap-2.5 border-t border-rule px-6 pt-3.5 pb-5">{footer}</div> : null}
    </div>
  );
}
