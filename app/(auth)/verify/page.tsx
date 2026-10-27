import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { ButtonLink } from "@/components/ui/button";
import { ResendButton } from "./resend-button";

export const metadata: Metadata = { title: "Check your inbox" };

type SearchParams = PageProps<"/verify">["searchParams"];

export default function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <OnboardingFrame step="Account">
      <div className="flex flex-col gap-3 border border-border bg-surface p-6">
        <h1 className="m-0 text-2xl font-semibold font-stretch-84%">Check your inbox</h1>
        <p className="m-0 leading-normal text-ink-2">
          We sent a confirmation link to{" "}
          <Suspense fallback="your email address">
            <EmailAddress searchParams={searchParams} />
          </Suspense>
          . It’s valid for 24 hours. Alert emails will go to this address, so it needs to work.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* For confirming on another device: this sends them through sign-in. */}
          <ButtonLink href="/onboarding/workspace">I’ve confirmed — continue</ButtonLink>
          <Suspense fallback={null}>
            <Resend searchParams={searchParams} />
          </Suspense>
        </div>
        <Link href="/sign-up" className="self-start text-[13px] text-muted">
          Wrong address? Change it
        </Link>
      </div>
    </OnboardingFrame>
  );
}

async function emailFrom(searchParams: SearchParams): Promise<string> {
  const { email } = await searchParams;
  return typeof email === "string" ? email : "";
}

async function EmailAddress({ searchParams }: { searchParams: SearchParams }) {
  const email = await emailFrom(searchParams);
  return email ? <b className="font-mono font-medium">{email}</b> : <>your email address</>;
}

async function Resend({ searchParams }: { searchParams: SearchParams }) {
  const email = await emailFrom(searchParams);
  return email ? <ResendButton email={email} /> : null;
}
