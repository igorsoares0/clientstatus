import type { Metadata } from "next";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Get started" };

export default function SignUpPage() {
  return (
    <OnboardingFrame step="Account">
      <SignUpForm />
    </OnboardingFrame>
  );
}
