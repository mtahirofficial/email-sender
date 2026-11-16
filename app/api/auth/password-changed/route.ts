import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    await sendAuthEmail({ to: user.email, kind: "password_changed" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("password changed notification failed", err);
    return NextResponse.json({ error: "Password changed, but the confirmation email could not be sent." }, { status: 503 });
  }
}
