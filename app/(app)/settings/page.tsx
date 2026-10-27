import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { getNotificationSettings } from "@/lib/notify/settings";
import { first, type Params } from "@/lib/search-params";
import { getPlan } from "@/lib/plans";
import { requireMembership } from "@/lib/session";
import { getObject } from "@/lib/storage";
import { AlertsForm } from "./alerts-form";
import { BrandingForm } from "./branding-form";
import { ScheduleForm } from "./schedule-form";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "alerts", label: "Alerts" },
  { key: "branding", label: "Report branding" },
  { key: "schedule", label: "Report schedule" },
] as const;

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Settings</h1>
        <span className="text-[13px] text-muted">
          Workspace defaults. Individual websites can turn alerts off on their own page.
        </span>
      </header>
      <PageBody>
        <Suspense fallback={<PanelSkeleton />}>
          <Settings searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireMembership();
  const tab = TABS.find((t) => t.key === first(params.tab))?.key ?? "alerts";
  const canManage = ctx.role !== "member";

  const [settings, members, overrides, ws] = await Promise.all([
    getNotificationSettings(db, ctx.workspaceId),
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: { id: true, name: true, email: true, emailVerified: true } } },
    }),
    db.site.findMany({
      where: { workspaceId: ctx.workspaceId, alertsEnabled: false, status: { not: "archived" } },
      select: { id: true, name: true, normalizedHostname: true },
    }),
    db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { name: true, brandPrimaryColor: true, reportContact: true, reportFooter: true, logoStorageKey: true },
    }),
  ]);
  let logoDataUri: string | null = null;
  if (tab === "branding" && ws.logoStorageKey) {
    const bytes = await getObject(ws.logoStorageKey).catch(() => null);
    if (bytes)
      logoDataUri = `data:${ws.logoStorageKey.endsWith(".svg") ? "image/svg+xml" : "image/png"};base64,${bytes.toString("base64")}`;
  }

  return (
    <div className="flex max-w-[1080px] flex-col gap-4">
      <div role="tablist" aria-label="Settings sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={t.key === tab}
            href={`/settings?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] no-underline ${t.key === tab ? "border-ink font-semibold text-ink" : "border-transparent text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {!canManage ? <p className="m-0 text-[13px] text-muted">Only admins can change these settings.</p> : null}
      {tab === "alerts" ? (
        <AlertsForm
          canManage={canManage}
          initial={{
            recipientUserIds: settings.recipientUserIds,
            events: settings.events,
            repeatMinutes: settings.repeatMinutes,
          }}
          members={members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            verified: m.user.emailVerified,
          }))}
          overrides={overrides}
        />
      ) : tab === "branding" ? (
        <BrandingForm
          canManage={canManage}
          initial={{
            name: ws.name,
            color: ws.brandPrimaryColor ?? "",
            contact: ws.reportContact ?? "",
            footer: ws.reportFooter ?? "",
          }}
          logoDataUri={logoDataUri}
          footerAllowed={getPlan(ctx.workspace.planKey).reportBranding !== "basic"}
        />
      ) : (
        <ScheduleForm
          canManage={canManage}
          initial={{ reportDelivery: settings.reportDelivery, linkExpiryDays: settings.linkExpiryDays }}
          timezone={ctx.workspace.timezone}
        />
      )}
    </div>
  );
}
