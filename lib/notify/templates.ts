import { escapeHtml } from "@/lib/email";

// Alert and report emails. Plain, readable HTML with a text twin; every value
// is escaped. Alerts go to the agency team only — never to clients.

type Mail = { subject: string; text: string; html: string };

function layout(opts: {
  preheader: string;
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
  footer: string;
  tone?: "down" | "ok" | "warn";
}) {
  const bar =
    opts.tone === "down" ? "#C2261B" : opts.tone === "ok" ? "#1F7A4A" : opts.tone === "warn" ? "#A35A00" : "#161A1C";
  const body = opts.lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${escapeHtml(l)}</p>`).join("");
  const action = opts.action
    ? `<p style="margin:16px 0 18px"><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;background:#161A1C;color:#FFFFFF;padding:10px 16px;text-decoration:none;font-weight:bold">${escapeHtml(opts.action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F4F5F3;font-family:Arial,Helvetica,sans-serif;color:#161A1C">
<span style="display:none">${escapeHtml(opts.preheader)}</span>
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #D5D8D4;border-top:4px solid ${bar};padding:22px 24px">
<h1 style="margin:0 0 12px;font-size:19px;line-height:1.3">${escapeHtml(opts.heading)}</h1>${body}${action}
<p style="margin:0;font-size:12px;color:#4A4F52;line-height:1.5">${escapeHtml(opts.footer)}</p>
</div></body></html>`;
}

export type IncidentMailInput = {
  kind: "opened" | "resolved" | "threshold" | "reminder";
  code: string;
  title: string;
  summary: string;
  host: string;
  client: string | null;
  when: string;
  duration?: string;
  url: string;
  workspaceName: string;
};

export function incidentMail(i: IncidentMailInput): Mail {
  const where = `${i.host}${i.client ? ` · ${i.client}` : ""}`;
  const subject =
    i.kind === "resolved"
      ? `Resolved: ${i.title} — ${i.host}`
      : i.kind === "reminder"
        ? `Still open: ${i.title} — ${i.host}`
        : `${i.title} — ${i.host}`;
  const heading =
    i.kind === "resolved" ? `Resolved: ${i.title}` : i.kind === "reminder" ? `Still open: ${i.title}` : i.title;
  const lines = [
    where,
    i.kind === "resolved"
      ? `Resolved ${i.when}${i.duration ? ` after ${i.duration}` : ""}.`
      : `${i.kind === "reminder" ? "Open since" : "Detected"} ${i.when}.`,
    i.summary,
  ];
  const footer =
    i.kind === "resolved"
      ? `${i.code} · ${i.workspaceName}. Sent to your team only.`
      : `${i.code} · ${i.workspaceName}. Acknowledge or mute it in Client Status to stop repeat emails. Sent to your team only.`;
  const text = `${heading}\n\n${lines.join("\n")}\n\nOpen in Client Status: ${i.url}\n\n${footer}`;
  return {
    subject,
    text,
    html: layout({
      preheader: lines.slice(0, 2).join(" — "),
      heading,
      lines,
      action: { label: "Open incident", url: i.url },
      footer,
      tone: i.kind === "resolved" ? "ok" : i.kind === "threshold" ? "warn" : "down",
    }),
  };
}

export type ReportMailInput = {
  agencyName: string;
  clientName: string;
  periodLabel: string;
  summary: string[];
  linkUrl: string | null;
  linkExpires: string | null;
  contact: string | null;
};

export function reportMail(r: ReportMailInput): Mail {
  const subject = `${r.clientName} — website health report, ${r.periodLabel}`;
  const lines = [
    `Here is the ${r.periodLabel} website health report for ${r.clientName}, prepared by ${r.agencyName}. The full report is attached as a PDF.`,
    ...r.summary,
  ];
  const linkLine = r.linkUrl ? `You can also view it online until ${r.linkExpires}.` : null;
  const footer = `${r.agencyName}${r.contact ? ` · ${r.contact}` : ""}`;
  const text = `${subject}\n\n${lines.join("\n\n")}${linkLine ? `\n\n${linkLine}\n${r.linkUrl}` : ""}\n\n${footer}`;
  return {
    subject,
    text,
    html: layout({
      preheader: r.summary[0] ?? subject,
      heading: `${r.clientName} · ${r.periodLabel}`,
      lines: linkLine ? [...lines, linkLine] : lines,
      action: r.linkUrl ? { label: "View the report online", url: r.linkUrl } : undefined,
      footer,
    }),
  };
}

export type UsageMailInput = { workspaceName: string; planName: string; active: number; max: number; url: string };

/** Sent to owners once per plan and month when active websites reach 90% of the plan. */
export function usageMail(u: UsageMailInput): Mail {
  const left = u.max - u.active;
  const subject = `${u.workspaceName}: ${u.active} of ${u.max} websites on ${u.planName}`;
  const lines = [
    `You’re monitoring ${u.active} of the ${u.max} websites your ${u.planName} plan includes${left > 0 ? ` — ${left} ${left === 1 ? "slot" : "slots"} left` : ""}.`,
    `At ${u.max}, new websites can’t be added until a slot is freed or the plan changes. Existing monitoring is never stopped.`,
  ];
  const footer = "Sent to workspace owners · Client Status";
  return {
    subject,
    text: `${subject}\n\n${lines.join("\n\n")}\n\nReview your plan: ${u.url}\n\n${footer}`,
    html: layout({
      preheader: lines[0]!,
      heading: subject,
      lines,
      action: { label: "Review plan", url: u.url },
      footer,
      tone: "warn",
    }),
  };
}
