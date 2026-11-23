import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { MARKETING_PREFIXES } from "@/lib/marketing-paths";
import { isUnknownMarketingSlug } from "@/lib/marketing-slugs";

// Optimistic check only: is there a session cookie at all? Real authorization
// happens in the Data Access Layer (lib/session.ts). Signed-in users are not
// bounced away from auth pages here, because a stale cookie would loop.

// "/r" = private report links, authorised by their token rather than a session.
// "/bot" = the crawler information page its User-Agent links to; the legal pages are public too.
// MARKETING_PREFIXES = the SEO pages (docs/pseo-plan.md), which crawlers must reach without a session.
// /robots.txt and the sitemaps have a file extension, so the matcher below skips them.
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/r",
  "/bot",
  "/terms",
  "/privacy",
  "/refunds",
  ...MARKETING_PREFIXES,
];

/** A path no route matches, so rendering it gives Next.js's not-found page with a 404 status. */
const NOT_FOUND_PATH = "/_unknown-page";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // "/" is the public landing page; signed-in users go straight to the app. A stale cookie
  // lands on /overview, whose session check sends it to /sign-in (public), so it can't loop.
  if (pathname === "/") {
    return getSessionCookie(request) ? NextResponse.redirect(new URL("/overview", request.url)) : NextResponse.next();
  }
  // Unknown SEO slugs (/alternatives/not-a-tool) must be real 404s, and only Proxy runs before the
  // page streams its 200 shell. The rewrite target matches no route, so Next.js serves its 404 page.
  if (isUnknownMarketingSlug(pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }
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
