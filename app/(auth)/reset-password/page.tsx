import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OnboardingFrame, Panel } from "@/components/onboarding-frame";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <OnboardingFrame>
      <Suspense fallback={<Panel title="Choose a new password" />}>
        <ResetWithParams searchParams={searchParams} />
      </Suspense>
    </OnboardingFrame>
  );
}

async function ResetWithParams({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const { token, error } = await searchParams;
  if (typeof token !== "string" || error) {
    return (
      <Panel
        title="This link doesn’t work any more"
        intro="Reset links expire after 1 hour and work only once."
        footer={
          <Link href="/forgot-password" className="text-[13px]">
            Request a new link
          </Link>
        }
      />
    );
  }
  return <ResetPasswordForm token={token} />;
}
