import { db } from "@/lib/db";
import { handleSslCheck } from "@/lib/tools/endpoints";

// Free SSL checker (/tools/ssl-checker): one live certificate check, nothing stored.
// The logic lives in lib/tools/endpoints.ts (tested in tests/integration/tools.test.ts).
export function POST(request: Request) {
  return handleSslCheck(request, { db });
}
