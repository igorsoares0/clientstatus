import { connection } from "next/server";
import { db } from "@/lib/db";
import { json, toolError } from "@/lib/tools/http";
import { getToolRun } from "@/lib/tools/runs";

// Status and result of a queued tool run. The id is random; results are noindex and uncached.
export async function GET(_request: Request, ctx: RouteContext<"/api/tools/runs/[id]">) {
  await connection();
  const run = await getToolRun(db, (await ctx.params).id);
  return run ? json({ ok: true, run }) : toolError("Not found.", 404);
}
