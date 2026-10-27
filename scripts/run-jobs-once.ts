// Processes queued jobs of the given types once, then exits. Used by e2e tests
// (and handy in development) to run report generation or email sending
// without a long-running worker. Usage: tsx scripts/run-jobs-once.ts report_generate email_send
import { createPrismaClient } from "@/lib/db";
import { createRunner } from "@/lib/jobs/runner";
import { closePdfBrowser } from "@/lib/reports/pdf";

async function main() {
  const types = process.argv.slice(2);
  if (!types.length) throw new Error("Pass at least one job type");
  const db = createPrismaClient();
  const runner = createRunner(db, {
    workerId: `once-${process.pid}`,
    concurrency: 4,
    auditConcurrency: 2,
    deps: { now: () => new Date() },
  });
  // Claim only the requested types, through the runner's execute path.
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const due = await db.job.count({
      where: { status: "pending", runAt: { lte: new Date() }, jobType: { in: types } },
    });
    if (!due) break;
    total += await runner.claimTypes(types);
    await runner.drain();
  }
  await closePdfBrowser();
  await db.$disconnect();
  console.log(`processed ${total} job(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
