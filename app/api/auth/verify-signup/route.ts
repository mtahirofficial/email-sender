import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!email || !token) return NextResponse.json({ error: "Enter your email and security code." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) return NextResponse.json({ error: "That code is invalid or has expired. Create a new account confirmation email." }, { status: 400 });
  await sendAuthEmail({ to: email, kind: "welcome" }).catch((err) => console.error("welcome email failed", err));
  return NextResponse.json({ ok: true });
}
