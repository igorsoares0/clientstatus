import { db } from "@/lib/db";
import { handleDomainCheck } from "@/lib/tools/endpoints";

// Free domain expiry checker (/tools/domain-expiry-checker): one RDAP lookup, nothing stored.
// The logic lives in lib/tools/endpoints.ts (tested in tests/integration/tools.test.ts).
export function POST(request: Request) {
  return handleDomainCheck(request, { db });
}
