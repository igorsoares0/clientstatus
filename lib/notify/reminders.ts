import type { PrismaClient } from "@/lib/generated/prisma/client";
import { workspaceWithAccess } from "@/lib/billing/access";
import { notifyIncident } from "@/lib/notify/incidents";
import { getNotificationSettings } from "@/lib/notify/settings";

// Repeat alerts (design "Repeat alerts"): while an incident stays open and
// unacknowledged, email again at most every `repeatMinutes`. Acknowledging or
// muting stops repeats; 0 means never repeat.

const REPEATING = ["downtime", "ssl_invalid"] as const;

export async function queueReminders(db: PrismaClient, now = new Date()) {
  const open = await db.incident.findMany({
    where: {
      status: "open",
      type: { in: [...REPEATING] },
      lastNotifiedAt: { not: null },
      workspace: workspaceWithAccess(now),
    },
    select: { id: true, workspaceId: true, lastNotifiedAt: true },
    take: 500,
  });
  const cache = new Map<string, number>();
  let queued = 0;
  for (const inc of open) {
    let repeat = cache.get(inc.workspaceId);
    if (repeat === undefined) {
      repeat = (await getNotificationSettings(db, inc.workspaceId)).repeatMinutes;
      cache.set(inc.workspaceId, repeat);
    }
    if (!repeat) continue;
    const due = inc.lastNotifiedAt!.getTime() + repeat * 60_000;
    if (due > now.getTime()) continue;
    const slot = String(Math.floor(now.getTime() / (repeat * 60_000)));
    queued += await db.$transaction((tx) => notifyIncident(tx, inc.id, "reminder", now, slot));
  }
  return queued;
}
