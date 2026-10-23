import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl } from "@/lib/google";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  }

  // ?sheets=1 also asks for Google Sheets access (spreadsheet automation).
  const withSheets = request.nextUrl.searchParams.get("sheets") === "1";
  const next = request.nextUrl.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(getGoogleAuthUrl(state, withSheets));
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };

  // Verified again in the callback to protect against CSRF.
  response.cookies.set("google_oauth_state", state, cookie);
  if (withSheets) response.cookies.set("google_oauth_sheets", "1", cookie);
  if (safeNext) response.cookies.set("google_oauth_next", safeNext, cookie);

  return response;
}
