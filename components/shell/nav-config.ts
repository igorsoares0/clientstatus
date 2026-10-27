import type { Route } from "next";

// Primary navigation (spec §9.1, design "Global shell"). Shortcut keys follow
// the sidebar hints: G then the letter.

export type NavKey = "overview" | "websites" | "clients" | "incidents" | "reports" | "team" | "settings" | "billing";

export type NavItem = {
  key: NavKey;
  label: string;
  href: Route;
  shortcut?: string;
  group: "main" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "/overview", shortcut: "o", group: "main" },
  { key: "websites", label: "Websites", href: "/websites", shortcut: "w", group: "main" },
  { key: "clients", label: "Clients", href: "/clients", shortcut: "c", group: "main" },
  { key: "incidents", label: "Incidents", href: "/incidents", shortcut: "i", group: "main" },
  { key: "reports", label: "Reports", href: "/reports", shortcut: "r", group: "main" },
  { key: "team", label: "Team", href: "/team", group: "admin" },
  { key: "settings", label: "Settings", href: "/settings", group: "admin" },
  { key: "billing", label: "Billing", href: "/billing", group: "admin" },
];
