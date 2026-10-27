// Two separate glyph systems (design README): status = shape glyph, severity =
// level meter. Colour is never the only signal — always glyph + text label.

export type SiteStatus = "up" | "degraded" | "down" | "stale" | "unknown" | "paused" | "inconclusive";

const STATUS: Record<SiteStatus, { glyph: string; label: string; text: string; glyphClass: string; weight: string }> = {
  up: { glyph: "●", label: "Up", text: "text-ink", glyphClass: "text-up", weight: "font-normal" },
  degraded: {
    glyph: "▲",
    label: "Degraded",
    text: "text-degraded",
    glyphClass: "text-degraded",
    weight: "font-semibold",
  },
  down: { glyph: "◆", label: "Down", text: "text-down", glyphClass: "text-down", weight: "font-semibold" },
  stale: { glyph: "○", label: "Stale", text: "text-ink", glyphClass: "text-muted", weight: "font-semibold" },
  unknown: { glyph: "○", label: "Unknown", text: "text-muted", glyphClass: "text-muted", weight: "font-normal" },
  paused: { glyph: "‖", label: "Paused", text: "text-muted", glyphClass: "text-muted", weight: "font-normal" },
  inconclusive: {
    glyph: "◌",
    label: "Inconclusive",
    text: "text-muted",
    glyphClass: "text-muted",
    weight: "font-normal",
  },
};

export function StatusGlyph({ status, label }: { status: SiteStatus; label?: string }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${s.text} ${s.weight}`}>
      <span aria-hidden="true" className={s.glyphClass}>
        {s.glyph}
      </span>
      {label ?? s.label}
    </span>
  );
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY: Record<Severity, { meter: string; label: string; className: string }> = {
  critical: { meter: "▮▮▮▮", label: "Critical", className: "text-down" },
  high: { meter: "▮▮▮▯", label: "High", className: "text-degraded" },
  medium: { meter: "▮▮▯▯", label: "Medium", className: "text-ink" },
  low: { meter: "▮▯▯▯", label: "Low", className: "text-muted" },
  info: { meter: "▯▯▯▯", label: "Info", className: "text-muted" },
};

/** `settled` drops the colour to muted once an item is acknowledged/muted/resolved. */
export function SeverityMeter({ severity, settled = false }: { severity: Severity; settled?: boolean }) {
  const s = SEVERITY[severity];
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${settled ? "text-muted" : s.className}`}>
      <span aria-hidden="true" className="font-mono tracking-[-0.08em]">
        {s.meter}
      </span>
      {s.label}
    </span>
  );
}
