import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getMicrosoftAuthUrl } from "@/lib/microsoft";

// Reads env vars and cookies per request; must never be prerendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    const message = encodeURIComponent("Outlook connections aren't available yet.");
    return NextResponse.redirect(new URL(`/compose?error=${message}`, process.env.NEXT_PUBLIC_APP_URL));
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(getMicrosoftAuthUrl(state));

  response.cookies.set("microsoft_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
