import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withResolvedIp } from "@/lib/rate-limit";

const handler = toNextJsHandler(auth);

// Better Auth rate-limits by the client address in a header we set ourselves
// (lib/auth.ts); any copy the client sent is replaced first.
function resolved(request: Request): Request {
  return new Request(request, { headers: withResolvedIp(request.headers) });
}

export const GET = (request: Request) => handler.GET(resolved(request));
export const POST = (request: Request) => handler.POST(resolved(request));
