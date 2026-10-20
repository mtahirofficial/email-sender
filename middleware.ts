import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { hasSupabaseSession } from "@/lib/supabase/session-cookie";

export async function middleware(request: NextRequest) {
  // Nothing to refresh without a session, so skip the Supabase round trip.
  if (!hasSupabaseSession(request.cookies.getAll())) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Public tracking pixels and metadata files never need session handling.
    "/((?!_next/static|_next/image|favicon.ico|email-test/track|robots.txt|sitemap.xml|manifest.webmanifest|icon.svg|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
