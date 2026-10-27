import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Optimistic check only: is there a session cookie at all? Real authorization
// happens in the Data Access Layer (lib/session.ts). Signed-in users are not
// bounced away from auth pages here, because a stale cookie would loop.

// "/r" = private report links, authorised by their token rather than a session.
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/verify", "/forgot-password", "/reset-password", "/r"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes (auth + health), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
