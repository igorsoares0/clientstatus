"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function HideOnPath({ path, children }: { path: string; children: ReactNode }) {
  return usePathname() === path ? null : children;
}
