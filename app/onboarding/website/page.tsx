import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OnboardingFrame, Panel } from "@/components/onboarding-frame";
import { QuickAddForm } from "@/components/sites/quick-add-form";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Add your first website" };

export default function FirstWebsitePage() {
  return (
    <OnboardingFrame step="First website">
      <Suspense fallback={<Panel title="Add your first client website" />}>
        <FirstWebsite />
      </Suspense>
    </OnboardingFrame>
  );
}

async function FirstWebsite() {
  await requireMembership();
  return (
    <>
      <div className="flex flex-col border border-border bg-surface">
        <div className="flex flex-col gap-1.5 px-6 pt-[22px] pb-1.5">
          <h1 className="m-0 text-2xl font-semibold font-stretch-84%">Add your first client website</h1>
          <p className="m-0 leading-normal text-ink-2">
            Uptime, SSL and domain checks start as soon as monitoring is running; the first audit runs overnight.
          </p>
        </div>
        <QuickAddForm variant="stacked" redirectTo="/overview" clientHint="— who the report is for" />
      </div>
      <p className="m-0 flex flex-wrap justify-between gap-2 text-[12.5px] text-muted">
        <span>
          Have a list? You can <Link href="/websites">import a CSV</Link> after setup.
        </span>
        <Link href="/overview">Skip for now</Link>
      </p>
    </>
  );
}
