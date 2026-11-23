import type { ReactNode } from "react";
import { Container } from "@/components/landing";
import { Breadcrumbs, type Crumb } from "@/components/marketing/breadcrumbs";

// Page sections shared by every marketing page (alternatives, compare, tools, domain expiry).

export function PageHero({
  crumbs,
  kicker,
  title,
  children,
  actions,
}: {
  crumbs: Crumb[];
  kicker: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-surface">
      <Container className="flex flex-col gap-5 py-10 tbl:py-12">
        <Breadcrumbs items={crumbs} />
        <div className="flex max-w-[760px] flex-col gap-4">
          <span className="font-mono text-[12px] tracking-[0.06em] text-muted uppercase">{kicker}</span>
          <h1 className="m-0 text-[36px] leading-[1.06] font-semibold font-stretch-82% tbl:text-[46px]">{title}</h1>
          {children}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </Container>
    </section>
  );
}

/** A band of the page: alternating white and canvas backgrounds like the landing page. */
export function Band({ children, tinted = false }: { children: ReactNode; tinted?: boolean }) {
  return (
    <section className={tinted ? "border-y border-border bg-surface" : ""}>
      <Container className="flex flex-col gap-6 py-12">{children}</Container>
    </section>
  );
}

export function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 flex max-w-[760px] list-none flex-col gap-2.5 p-0 text-[15px] leading-relaxed text-ink-2">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <span aria-hidden="true" className="mt-[2px] font-mono text-muted">
            —
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
