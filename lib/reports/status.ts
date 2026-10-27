export const REPORT_STATUS = {
  generating: { glyph: "○", label: "Generating…", cls: "text-muted" },
  needs_review: { glyph: "▲", label: "Needs review", cls: "font-semibold text-degraded" },
  sent: { glyph: "●", label: "Sent", cls: "text-up" },
  no_data: { glyph: "○", label: "No data", cls: "text-muted" },
  failed: { glyph: "◆", label: "Failed", cls: "font-semibold text-down" },
} as const;
