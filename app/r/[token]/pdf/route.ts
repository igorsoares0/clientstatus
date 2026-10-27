import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { findReportByToken } from "@/lib/data/reports";
import { allow, clientIp } from "@/lib/rate-limit";
import { goneResponse, pdfResponse } from "@/lib/reports/serve";
import { getObject } from "@/lib/storage";

export async function GET(req: NextRequest, ctx: RouteContext<"/r/[token]/pdf">) {
  if (!allow(`report-link:${clientIp(req.headers)}`, 60, 60_000))
    return new Response("Too many requests", { status: 429 });
  const { token } = await ctx.params;
  const report = await findReportByToken(db, token);
  if (!report?.storageKey) return goneResponse();
  return pdfResponse(await getObject(report.storageKey), `${report.code}.pdf`);
}
