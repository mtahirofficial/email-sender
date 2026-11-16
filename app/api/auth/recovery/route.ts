import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAuthEmail } from "@/lib/auth-email";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "recovery", email,
    });
    if (!error) {
      const link = new URL("/auth/verify", SITE_URL);
      link.searchParams.set("token_hash", data.properties.hashed_token);
      link.searchParams.set("type", "recovery");
      await sendAuthEmail({ to: email, kind: "recovery", link: link.toString(), code: data.properties.email_otp });
    }
  } catch (error) {
    console.error("auth recovery email failed", error);
  }
  // Use the same response whether or not an account exists.
  return NextResponse.json({ ok: true });
}
