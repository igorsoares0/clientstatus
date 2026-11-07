import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withResolvedIp } from "@/lib/rate-limit";

const handler = toNextJsHandler(auth);

// Better Auth rate-limits by the client address in a header we set ourselves
// (lib/auth.ts); any copy the client sent is replaced first.
// Built from the parts, not `new Request(request, …)`: Next hands route handlers a Proxy around the
// request, and Request's constructor reads a private field of its input, which a Proxy doesn't carry
// ("Cannot read private member #state").
function resolved(request: Request): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: withResolvedIp(request.headers),
    body: request.body,
    signal: request.signal,
    duplex: "half",
  };
  return new Request(request.url, init);
}

export const GET = (request: Request) => handler.GET(resolved(request));
export const POST = (request: Request) => handler.POST(resolved(request));
