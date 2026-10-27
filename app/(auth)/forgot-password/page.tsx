import type { Metadata } from "next";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <OnboardingFrame>
      <ForgotPasswordForm />
    </OnboardingFrame>
  );
}
