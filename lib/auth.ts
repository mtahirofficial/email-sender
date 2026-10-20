import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSession } from "@/lib/supabase/session-cookie";

/**
 * The signed-in user, or null. Public pages call this to pick the right
 * header; it makes no network request at all for visitors without a session
 * cookie (including search crawlers), and is memoised per request.
 */
export const getOptionalUser = cache(async () => {
  if (!hasSupabaseSession(cookies().getAll())) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
