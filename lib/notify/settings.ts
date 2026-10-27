import { z } from "zod";
import type { Tx } from "@/lib/data/workspace-tx";

// Alert settings (FR-NOT-02). Defaults: owner gets everything; one email per
// hour at most for a still-unacknowledged incident; reports held for review.

export const ALERT_EVENTS = {
  downtime: { label: "Downtime", rule: "After 2 consecutive failed checks · resolves after 2 passes", resolves: true },
  ssl_invalid: { label: "SSL certificate invalid", rule: "Expired, untrusted or wrong hostname", resolves: true },
  ssl_expiry: { label: "SSL certificate expiring", rule: "30, 14, 7 and 1 days before", resolves: false },
  domain_expiry: {
    label: "Domain expiring",
    rule: "30, 14, 7 and 1 days before · only where the registry publishes a date",
    resolves: false,
  },
} as const;

export type AlertEvent = keyof typeof ALERT_EVENTS;

export const eventsSchema = z.object({
  downtime: z.object({ opened: z.boolean(), resolved: z.boolean() }),
  ssl_invalid: z.object({ opened: z.boolean(), resolved: z.boolean() }),
  ssl_expiry: z.object({ opened: z.boolean() }),
  domain_expiry: z.object({ opened: z.boolean() }),
});

export type AlertEvents = z.infer<typeof eventsSchema>;

export const DEFAULT_EVENTS: AlertEvents = {
  downtime: { opened: true, resolved: true },
  ssl_invalid: { opened: true, resolved: true },
  ssl_expiry: { opened: true },
  domain_expiry: { opened: true },
};

export const REPEAT_OPTIONS = [30, 60, 240, 0] as const;
export const LINK_EXPIRY_OPTIONS = [30, 60, 90] as const;

export type NotificationConfig = {
  recipientUserIds: string[];
  events: AlertEvents;
  repeatMinutes: number;
  reportDelivery: "review" | "auto";
  linkExpiryDays: number;
};

/** Settings for a workspace, created with defaults (owner as recipient) on first use. */
export async function getNotificationSettings(tx: Tx, workspaceId: string): Promise<NotificationConfig> {
  let row = await tx.notificationSettings.findUnique({ where: { workspaceId } });
  if (!row) {
    const owner = await tx.workspaceMember.findFirst({
      where: { workspaceId, role: "owner" },
      select: { userId: true },
    });
    // Two first-time readers can race to create the defaults; the loser just reads the winner's row.
    await tx.notificationSettings.createMany({
      data: [{ workspaceId, recipientUserIds: owner ? [owner.userId] : [], events: DEFAULT_EVENTS }],
      skipDuplicates: true,
    });
    row = await tx.notificationSettings.findUniqueOrThrow({ where: { workspaceId } });
  }
  const events = eventsSchema.safeParse(row.events);
  return {
    recipientUserIds: row.recipientUserIds,
    events: events.success ? events.data : DEFAULT_EVENTS,
    repeatMinutes: row.repeatMinutes,
    reportDelivery: row.reportDelivery === "auto" ? "auto" : "review",
    linkExpiryDays: row.linkExpiryDays,
  };
}
