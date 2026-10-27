"use client";

import { useEffect, useState } from "react";

/** Sticky section index with scroll-spy (≥ 980px), as in Website Detail.dc.html. */
export function OnThisPage({ sections }: { sections: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-5 hidden w-40 shrink-0 flex-col border-l border-border nav:flex"
    >
      {sections.map((s) => {
        const on = s.id === current;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={on ? "location" : undefined}
            className={`-ml-px border-l-2 px-3 py-1.5 text-[13px] whitespace-nowrap no-underline hover:text-ink ${
              on ? "border-ink font-semibold text-ink" : "border-transparent text-muted"
            }`}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
