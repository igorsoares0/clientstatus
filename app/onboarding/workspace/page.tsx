import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OnboardingFrame, Panel } from "@/components/onboarding-frame";
import { findWorkspaceIdForUser, requireUser } from "@/lib/session";
import { WorkspaceForm } from "./workspace-form";

export const metadata: Metadata = { title: "Name your workspace" };

export default function WorkspacePage() {
  return (
    <OnboardingFrame step="Workspace">
      <Suspense fallback={<Panel title="Name your workspace" />}>
        <WorkspaceGate />
      </Suspense>
    </OnboardingFrame>
  );
}

async function WorkspaceGate() {
  const user = await requireUser();
  if (await findWorkspaceIdForUser(user.id)) redirect("/overview");
  return <WorkspaceForm />;
}
