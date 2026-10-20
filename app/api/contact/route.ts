import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  // Honeypot: real visitors never see or fill this field. Pretend success to bots.
  if (body?.website) return NextResponse.json({ ok: true });

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(body?.name);
  const email = str(body?.email).toLowerCase();
  const subject = str(body?.subject);
  const message = str(body?.message);

  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL.test(email) || email.length > 120) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (subject.length > 120) return NextResponse.json({ error: "Subject is too long." }, { status: 400 });
  if (message.length < 10 || message.length > 3000) return NextResponse.json({ error: "Message must be 10 to 3000 characters." }, { status: 400 });

  const admin = createAdminClient();

  // Basic abuse guard: at most 3 messages per address per hour.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "You've sent a few messages already. Please try again later." }, { status: 429 });
  }

  const { error } = await admin.from("contact_messages").insert({ name, email, subject: subject || null, message });
  if (error) {
    console.error("contact insert failed:", error);
    return NextResponse.json({ error: "Could not send your message. Please try again later." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
