import type { NextRequest } from "next/server";
import { apiMembership } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { pdfResponse } from "@/lib/reports/serve";
import { getObject } from "@/lib/storage";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[id]/pdf">) {
  const member = await apiMembership(req.headers);
  if (!member) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const report = await db.monthlyReport.findFirst({
    where: { id, workspaceId: member.workspaceId },
    select: { storageKey: true, code: true },
  });
  if (!report?.storageKey) return new Response("Not found", { status: 404 });
  return pdfResponse(
    await getObject(report.storageKey),
    `${report.code}.pdf`,
    req.nextUrl.searchParams.get("download") !== "1",
  );
}
