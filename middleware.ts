import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** True when the browser carries a Supabase auth cookie (no network call). */
function hasSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export async function middleware(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    // Signed-out visitors (and search crawlers) get the static, fast, indexable
    // landing page at "/". The URL stays "/", it is only rewritten internally.
    if (request.nextUrl.pathname === "/") {
      return NextResponse.rewrite(new URL("/welcome", request.url));
    }
    // Nothing to refresh without a session, so skip the Supabase round trip.
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Public tracking pixels and metadata files never need session handling.
    "/((?!_next/static|_next/image|favicon.ico|email-test/track|robots.txt|sitemap.xml|manifest.webmanifest|icon.svg|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
