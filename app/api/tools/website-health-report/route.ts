import { db } from "@/lib/db";
import { handleHealthReport } from "@/lib/tools/endpoints";

// Free health report: checks one site in the worker and emails a sample report PDF.
// The logic lives in lib/tools/endpoints.ts (tested in tests/integration/tools.test.ts).
export function POST(request: Request) {
  return handleHealthReport(request, { db });
}
