"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  BillingIcon,
  ClientsIcon,
  IncidentsIcon,
  OverviewIcon,
  ReportsIcon,
  SettingsIcon,
  TeamIcon,
  WebsitesIcon,
} from "@/components/ui/icons";
import { NAV_ITEMS, type NavItem, type NavKey } from "./nav-config";

const ICONS: Record<NavKey, ComponentType> = {
  overview: OverviewIcon,
  websites: WebsitesIcon,
  clients: ClientsIcon,
  incidents: IncidentsIcon,
  reports: ReportsIcon,
  team: TeamIcon,
  settings: SettingsIcon,
  billing: BillingIcon,
};

function useActiveKey(): NavKey | undefined {
  const pathname = usePathname();
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.key;
}

/** Wide sidebar list (≥ 980px). */
export function SidebarLinks({ unacknowledgedIncidents }: { unacknowledgedIncidents: number }) {
  const active = useActiveKey();
  const row = (item: NavItem) => {
    const Icon = ICONS[item.key];
    const isActive = item.key === active;
    const tone = isActive
      ? "bg-ink text-white hover:text-white"
      : item.group === "admin"
        ? "text-muted hover:bg-nav-hover"
        : "text-ink hover:bg-nav-hover hover:text-ink";
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`flex justify-between px-4 py-2 no-underline ${tone}`}
      >
        <span className="flex items-center gap-2.5">
          <Icon />
          {item.label}
          {item.key === "incidents" && unacknowledgedIncidents > 0 ? (
            <span className={`font-mono font-semibold ${isActive ? "text-white" : "text-down"}`}>
              {unacknowledgedIncidents}
              <span className="sr-only"> not acknowledged</span>
            </span>
          ) : null}
        </span>
        {item.shortcut ? (
          <span aria-hidden="true" className={`font-mono text-xs ${isActive ? "opacity-70" : "text-muted"}`}>
            G {item.shortcut.toUpperCase()}
          </span>
        ) : null}
      </Link>
    );
  };
  return (
    <>
      {NAV_ITEMS.filter((i) => i.group === "main").map(row)}
      <div className="mx-4 my-3 h-px bg-rule" />
      {NAV_ITEMS.filter((i) => i.group === "admin").map(row)}
    </>
  );
}

/** Narrow horizontal bar (< 980px). */
export function TopBarLinks() {
  const active = useActiveKey();
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`px-2.5 py-1.5 no-underline ${isActive ? "bg-ink text-white hover:text-white" : item.group === "admin" ? "text-muted" : "text-ink"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
