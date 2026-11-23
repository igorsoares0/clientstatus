import { db } from "@/lib/db";
import { handleLinkCheck } from "@/lib/tools/endpoints";

// Free broken-link checker: queues a small crawl for the worker; the page polls /api/tools/runs/<id>.
// The logic lives in lib/tools/endpoints.ts (tested in tests/integration/tools.test.ts).
export function POST(request: Request) {
  return handleLinkCheck(request, { db });
}
