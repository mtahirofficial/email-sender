import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error && next === "/reset-password") {
      return NextResponse.redirect(new URL("/forgot-password?link=expired", appUrl));
    }
    if (!error && next === "/auth/confirmed") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) await sendAuthEmail({ to: user.email, kind: "welcome" }).catch((err) => console.error("welcome email failed", err));
    }
  }

  // Only ever redirect to a path on this site.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, appUrl));
}
