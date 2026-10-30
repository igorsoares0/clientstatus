import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { env } from "@/lib/env";
import { LEGAL_PAGES, LEGAL_UPDATED } from "@/lib/legal";

// Shell for /terms, /privacy and /refunds. The seller's name and contact address come from the
// runtime environment (LEGAL_NAME, SUPPORT_EMAIL), so the body renders per request, not at build.

export type LegalParty = { name: ReactNode; email: ReactNode };

function Missing({ variable }: { variable: string }) {
  return <span className="bg-warn-tint px-1 font-mono text-warn-strong">[{variable} not set]</span>;
}

async function Body({ children }: { children: (party: LegalParty) => ReactNode }) {
  await connection();
  const { LEGAL_NAME, SUPPORT_EMAIL } = env();
  return children({
    name: LEGAL_NAME ?? <Missing variable="LEGAL_NAME" />,
    email: SUPPORT_EMAIL ? (
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    ) : (
      <Missing variable="SUPPORT_EMAIL" />
    ),
  });
}

export function LegalPage({
  title,
  path,
  children,
}: {
  title: string;
  path: (typeof LEGAL_PAGES)[number]["href"];
  children: (party: LegalParty) => ReactNode;
}) {
  return (
    <OnboardingFrame>
      <article className="flex flex-col border border-border bg-surface">
        <header className="flex flex-col gap-1.5 border-b border-rule px-6 pt-[22px] pb-4">
          <h1 className="m-0 text-2xl font-semibold font-stretch-84%">{title}</h1>
          <p className="m-0 text-[12.5px] text-muted">Last updated {LEGAL_UPDATED}</p>
        </header>
        <div className="flex flex-col gap-5 px-6 py-5 leading-normal text-ink-2">
          <Suspense fallback={<p className="m-0">Loading…</p>}>
            <Body>{children}</Body>
          </Suspense>
        </div>
        <nav
          aria-label="Legal"
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-6 pt-3.5 pb-5 text-[12.5px]"
        >
          {LEGAL_PAGES.map((p) =>
            p.href === path ? (
              <span key={p.href} aria-current="page" className="font-semibold text-ink">
                {p.label}
              </span>
            ) : (
              <Link key={p.href} href={p.href}>
                {p.label}
              </Link>
            ),
          )}
        </nav>
      </article>
    </OnboardingFrame>
  );
}

/** Numbered section with a heading; paragraphs and lists go inside. */
export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 [&_li]:mt-1 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
      <h2 className="m-0 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
