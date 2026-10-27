import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { findReportByToken } from "@/lib/data/reports";
import { allow, clientIp } from "@/lib/rate-limit";
import type { StoredReport } from "@/lib/reports/generate";
import { goneResponse, reportHtmlResponse } from "@/lib/reports/serve";

// Public, unauthenticated private-link view of a sent report (FR-REP-09).
export async function GET(req: NextRequest, ctx: RouteContext<"/r/[token]">) {
  if (!allow(`report-link:${clientIp(req.headers)}`, 60, 60_000))
    return new Response("Too many requests", { status: 429 });
  const { token } = await ctx.params;
  const report = await findReportByToken(db, token);
  if (!report?.data) return goneResponse();
  return reportHtmlResponse(report.data as unknown as StoredReport, "'none'");
}
