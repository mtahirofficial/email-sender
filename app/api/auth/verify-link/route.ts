import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tokenHash = typeof body?.tokenHash === "string" ? body.tokenHash : "";
  const type = body?.type;
  if (!tokenHash || !["signup", "recovery"].includes(type)) return NextResponse.json({ error: "This verification link is invalid." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.json({ error: "This link has expired or was already used. Request a new email and try again." }, { status: 400 });
  if (type === "signup" && data.user?.email) {
    await sendAuthEmail({ to: data.user.email, kind: "welcome" }).catch((err) => console.error("welcome email failed", err));
  }
  return NextResponse.json({ ok: true, next: type === "recovery" ? "/reset-password" : "/auth/confirmed" });
}
