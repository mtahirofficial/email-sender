import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

/** For API routes: resolves to the admin user, or a ready-made error response. */
export async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  // 404 rather than 403 so the endpoint does not advertise itself.
  if (!isAdminUser(user)) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { user };
}
