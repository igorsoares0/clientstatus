import type { Tx } from "@/lib/data/workspace-tx";
import { env } from "@/lib/env";
import { formatClock, formatShortDate } from "@/lib/format";
import { getNotificationSettings, type AlertEvent } from "@/lib/notify/settings";
import { incidentMail } from "@/lib/notify/templates";

// Queues alert emails for incident changes (FR-NOT-01/03/05). One email per
// recipient per event — never per failed check. Deduplication keys make retries
// and concurrent workers safe. Muted incidents and sites with alerts off are skipped.

export type NotifyKind = "opened" | "resolved" | "threshold" | "reminder";

function duration(from: Date, to: Date) {
  const min = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} days`;
}

/** Returns how many emails were queued. `slot` distinguishes repeat reminders and thresholds. */
export async function notifyIncident(tx: Tx, incidentId: string, kind: NotifyKind, now: Date, slot = "") {
  const incident = await tx.incident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      workspaceId: true,
      number: true,
      type: true,
      status: true,
      title: true,
      summary: true,
      firstDetectedAt: true,
      resolvedAt: true,
      site: { select: { normalizedHostname: true, alertsEnabled: true, client: { select: { name: true } } } },
      workspace: { select: { name: true, timezone: true } },
    },
  });
  if (!incident || incident.type === "audit_issue") return 0; // audit issues: app + report only
  if (!incident.site.alertsEnabled) return 0;
  if (incident.status === "muted" && kind !== "resolved") return 0;

  const settings = await getNotificationSettings(tx, incident.workspaceId);
  const event = settings.events[incident.type as AlertEvent];
  const wanted = kind === "resolved" ? "resolved" in event && event.resolved : event.opened;
  if (!wanted || settings.recipientUserIds.length === 0) return 0;

  // Only current members with verified addresses.
  const recipients = await tx.workspaceMember.findMany({
    where: {
      workspaceId: incident.workspaceId,
      userId: { in: settings.recipientUserIds },
      user: { emailVerified: true },
    },
    select: { user: { select: { id: true, email: true } } },
  });
  if (recipients.length === 0) return 0;

  const tz = incident.workspace.timezone;
  const at =
    kind === "resolved" && incident.resolvedAt
      ? incident.resolvedAt
      : kind === "reminder"
        ? incident.firstDetectedAt
        : now;
  const mail = incidentMail({
    kind,
    code: `INC-${String(incident.number).padStart(4, "0")}`,
    title: incident.title,
    summary: incident.summary,
    host: incident.site.normalizedHostname,
    client: incident.site.client?.name ?? null,
    when: `${formatShortDate(at, tz, now)} ${formatClock(at, tz, false)} (${tz})`,
    duration:
      kind === "resolved" && incident.resolvedAt ? duration(incident.firstDetectedAt, incident.resolvedAt) : undefined,
    url: `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/incidents?i=${incident.id}`,
    workspaceName: incident.workspace.name,
  });

  let queued = 0;
  for (const { user } of recipients) {
    const key = `incident:${incident.id}:${kind}:${slot}:${user.id}`;
    const existing = await tx.emailDelivery.findUnique({ where: { deduplicationKey: key }, select: { id: true } });
    if (existing) continue;
    const delivery = await tx.emailDelivery.create({
      data: {
        workspaceId: incident.workspaceId,
        recipient: user.email,
        templateType: `incident_${kind}`,
        deduplicationKey: key,
        subject: mail.subject,
        textBody: mail.text,
        htmlBody: mail.html,
        incidentId: incident.id,
        scheduledAt: now,
      },
      select: { id: true },
    });
    await tx.job.create({
      data: {
        workspaceId: incident.workspaceId,
        jobType: "email_send",
        resourceType: "email",
        resourceId: delivery.id,
        priority: 8,
        runAt: now,
        maxAttempts: 5,
        activeKey: `email_send:${delivery.id}`,
      },
    });
    queued++;
  }
  if (queued && kind !== "resolved")
    await tx.incident.update({ where: { id: incident.id }, data: { lastNotifiedAt: now } });
  return queued;
}
