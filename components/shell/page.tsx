import type { ReactNode } from "react";

// Page scaffolding shared by every workspace screen: H1 22px/600/85% with a
// 28px gutter (design README "Typography" and "Spacing").

export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-7 pt-[18px] pb-3.5">
      <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">{title}</h1>
      {meta ? <span className="font-mono text-xs text-muted">{meta}</span> : null}
      {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col gap-5 px-7 pb-7">{children}</main>;
}

/** Empty-state panel: title block with intro, optional body, muted footer line. */
export function EmptyPanel({
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
    <section className="flex max-w-[760px] flex-col border border-border bg-surface">
      <div className={`flex flex-col gap-2 px-6 pt-6 pb-[18px] ${children || footer ? "border-b border-rule" : ""}`}>
        <h2 className="m-0 text-2xl font-semibold font-stretch-85%">{title}</h2>
        {intro ? <p className="m-0 max-w-[600px] leading-normal text-pretty text-ink-2">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-col gap-3 px-6 py-[18px] leading-normal text-ink-2">{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-rule px-6 pt-3.5 pb-5 text-[13px] text-muted">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** Skeleton matching EmptyPanel geometry, used as the Suspense fallback. */
export function PanelSkeleton() {
  return (
    <div aria-busy="true" className="flex max-w-[760px] flex-col gap-3 border border-border bg-surface p-6">
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-2/5 bg-rule" />
      <div className="h-4 w-4/5 bg-rule-soft" />
      <div className="h-4 w-3/5 bg-rule-soft" />
    </div>
  );
}

/** Marks controls whose feature isn't built yet, so nothing pretends to work. */
export function NotYetAvailable({ children = "Available in the next release" }: { children?: ReactNode }) {
  return <span className="text-[12.5px] text-muted">{children}</span>;
}
