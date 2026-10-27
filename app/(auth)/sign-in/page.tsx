import type { Metadata } from "next";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <OnboardingFrame>
      <SignInForm />
    </OnboardingFrame>
  );
}
