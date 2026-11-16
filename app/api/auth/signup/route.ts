import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 6 characters." }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup", email, password,
    });
    if (error) throw error;
    const link = new URL("/auth/verify", SITE_URL);
    link.searchParams.set("token_hash", data.properties.hashed_token);
    link.searchParams.set("type", "signup");
    await sendAuthEmail({ to: email, kind: "signup", link: link.toString(), code: data.properties.email_otp });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("auth signup email failed", error);
    return NextResponse.json({ error: error instanceof Error && /not configured/i.test(error.message) ? error.message : "Could not create the account or send its confirmation email. Check the email address and try again." }, { status: 400 });
  }
}
