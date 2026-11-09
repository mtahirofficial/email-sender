import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTransientAuthError } from "@/lib/supabase/auth-errors";

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

  const transient = isTransientAuthError(error);
  const signedIn = user ? true : transient ? null : false;
  return NextResponse.json({ signedIn }, { headers: { "Cache-Control": "no-store" } });
}
