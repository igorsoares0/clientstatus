"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NAV_ITEMS } from "./nav-config";

const CHORD_TIMEOUT_MS = 1200;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** "G then letter" navigation, matching the sidebar hints. Ignored while typing. */
export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let armedAt = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (armedAt && Date.now() - armedAt < CHORD_TIMEOUT_MS) {
        armedAt = 0;
        const item = NAV_ITEMS.find((i) => i.shortcut === key);
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      armedAt = key === "g" ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
