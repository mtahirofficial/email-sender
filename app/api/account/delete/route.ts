import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Permanently deletes the signed-in user. Connected mailboxes, sent history
// and test data are removed too (they reference auth.users with ON DELETE CASCADE).
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Type "DELETE" to confirm.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const avatar = (user.user_metadata as Record<string, unknown> | undefined)?.avatar_url;
  if (typeof avatar === "string" && avatar.startsWith("/avatars/")) {
    await admin.storage.from("avatars").remove([avatar.slice("/avatars/".length)]);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account delete failed:", error);
    return NextResponse.json({ error: "Could not delete your account. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
