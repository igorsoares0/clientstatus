import type { NextRequest } from "next/server";
import { apiMembership } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { StoredReport } from "@/lib/reports/generate";
import { reportHtmlResponse } from "@/lib/reports/serve";

// Team preview of a report, framed by the review page.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[id]/html">) {
  const member = await apiMembership(req.headers);
  if (!member) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const report = await db.monthlyReport.findFirst({
    where: { id, workspaceId: member.workspaceId },
    select: { data: true },
  });
  if (!report?.data) return new Response("Not found", { status: 404 });
  return reportHtmlResponse(report.data as unknown as StoredReport, "'self'");
}
