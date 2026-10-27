import type { DomainState, LiveStatus, SiteStatus as StoredStatus, SslState } from "@/lib/generated/prisma/enums";
import type { SiteStatus as DisplayStatus } from "@/components/ui/status";
import { formatClock, formatShortDate, shortPersonName } from "@/lib/format";

// How a website's state is shown. Design rule 1: never present stale or
// inconclusive data as current — every status carries its last-check time.

export type SiteStatusView = { status: DisplayStatus; label: string; sub: string; stale: boolean };

export type StateLike = {
  liveStatus: LiveStatus;
  statusDetail: string | null;
  statusSince: Date | null;
  lastCheckAt: Date | null;
} | null;

/** A result older than two check intervals is stale (design "State & data"). */
export function isStale(lastCheckAt: Date | null, intervalMs: number, now: Date): boolean {
  return lastCheckAt !== null && now.getTime() - lastCheckAt.getTime() > 2 * intervalMs;
}

const LABEL: Record<LiveStatus, string> = { up: "Up", degraded: "Degraded", down: "Down", unknown: "Unknown" };

export function siteStatusView(
  site: { status: StoredStatus; pausedAt: Date | null; archivedAt: Date | null; pausedBy: { name: string } | null },
  state: StateLike,
  intervalMs: number,
  timeZone: string,
  now = new Date(),
): SiteStatusView {
  if (site.status === "paused") {
    const since = site.pausedAt ? `since ${formatShortDate(site.pausedAt, timeZone, now)}` : "";
    const by = site.pausedBy ? shortPersonName(site.pausedBy.name) : "";
    return { status: "paused", label: "Paused", sub: [since, by].filter(Boolean).join(" · "), stale: false };
  }
  if (site.status === "archived") {
    return {
      status: "unknown",
      label: "Archived",
      sub: site.archivedAt ? `on ${formatShortDate(site.archivedAt, timeZone, now)} · history kept` : "history kept",
      stale: false,
    };
  }
  if (!state?.lastCheckAt) return { status: "unknown", label: "Unknown", sub: "awaiting first check", stale: false };

  if (isStale(state.lastCheckAt, intervalMs, now)) {
    return {
      status: "stale",
      label: "Stale",
      sub: `last known ${LABEL[state.liveStatus].toLowerCase()} as of ${formatClock(state.lastCheckAt, timeZone, false)}`,
      stale: true,
    };
  }
  switch (state.liveStatus) {
    case "down":
      return {
        status: "down",
        label: "Down",
        sub: [
          state.statusDetail?.split(" · ")[0],
          state.statusSince ? `since ${formatClock(state.statusSince, timeZone, false)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        stale: false,
      };
    case "degraded":
      return { status: "degraded", label: "Degraded", sub: state.statusDetail ?? "", stale: false };
    case "up":
      return { status: "up", label: "Up", sub: state.statusDetail ?? "", stale: false };
    default:
      return { status: "inconclusive", label: "Unknown", sub: "only inconclusive results so far", stale: false };
  }
}

export type CellView = { text: string; title: string; tone: "ink" | "muted" | "degraded" | "down"; strong: boolean };

const DAY = 86_400_000;

export function sslCell(
  s: { sslState: SslState; sslExpiresAt: Date | null; sslDetail: string | null; sslCheckedAt: Date | null } | null,
  https: boolean,
  now: Date,
): CellView {
  if (!https || s?.sslState === "none")
    return { text: "http only", title: "http only — no SSL check", tone: "muted", strong: false };
  if (!s || s.sslState === "unknown") return { text: "—", title: "Not checked yet", tone: "muted", strong: false };
  if (s.sslState === "expired") return { text: "Expired", title: s.sslDetail ?? "Expired", tone: "down", strong: true };
  if (s.sslState === "invalid")
    return { text: "Invalid", title: s.sslDetail ?? "Invalid certificate", tone: "down", strong: true };
  const days = s.sslExpiresAt ? Math.floor((s.sslExpiresAt.getTime() - now.getTime()) / DAY) : null;
  if (days === null) return { text: "—", title: s.sslDetail ?? "", tone: "muted", strong: false };
  return {
    text: `${days} d`,
    title: s.sslDetail ?? `${days} days remaining`,
    tone: days <= 7 ? "down" : days <= 30 ? "degraded" : "ink",
    strong: days <= 30,
  };
}

export function domainCell(
  s: { domainState: DomainState; domainExpiresAt: Date | null; domainDetail: string | null } | null,
  now: Date,
): CellView {
  if (!s || s.domainState === "unknown") return { text: "—", title: "Not checked yet", tone: "muted", strong: false };
  if (s.domainState === "unsupported")
    return { text: "n/a", title: s.domainDetail ?? "Not published by the registry", tone: "muted", strong: false };
  if (s.domainState === "error" || !s.domainExpiresAt)
    return { text: "—", title: s.domainDetail ?? "Lookup failed — will retry", tone: "muted", strong: false };
  const days = Math.floor((s.domainExpiresAt.getTime() - now.getTime()) / DAY);
  return {
    text: `${days} d`,
    title: s.domainDetail ?? "",
    tone: days <= 7 ? "down" : days <= 30 ? "degraded" : "ink",
    strong: days <= 30,
  };
}
