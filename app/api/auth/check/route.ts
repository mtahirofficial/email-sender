import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Is this browser still signed in? Always answers 200. `signedIn` is true, false, or null when
 * it could not be decided (e.g. the auth service was unreachable), so a hiccup never logs anyone out.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const transient = Boolean(error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500));
  const signedIn = user ? true : transient ? null : false;
  return NextResponse.json({ signedIn }, { headers: { "Cache-Control": "no-store" } });
}
