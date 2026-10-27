import { connection } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger("health");

// Liveness + database reachability for the web process (FR-OPS-02).
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.error("database unreachable", { error });
    return Response.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
