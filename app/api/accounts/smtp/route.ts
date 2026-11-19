import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/token-crypto";
import { verifySmtpConnection } from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to connect a sending account." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const host = typeof body?.host === "string" ? body.host.trim().toLowerCase() : "";
  const port = Number(body?.port);
  const secure = body?.secure === true;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!host || host.length > 255 || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !username || username.length > 320 || !password || password.length > 1024 || !EMAIL.test(email)) {
    return NextResponse.json({ error: "Check the server, port, username, password, and sending email." }, { status: 400 });
  }

  try {
    await verifySmtpConnection({ host, port, secure, username, password });
    const { error } = await supabase.from("connected_accounts").upsert({
      user_id: user.id,
      provider: "smtp",
      email,
      access_token: encryptToken(JSON.stringify({ username, password })),
      refresh_token: "",
      expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      smtp_host: host,
      smtp_port: port,
      smtp_secure: secure,
      needs_reconnect: false,
      sheets_enabled: false,
      inbox_enabled: false,
    }, { onConflict: "user_id,provider,email" });
    if (error) {
      console.error("SMTP account could not be saved", { code: error.code, message: error.message });
      if (/provider_check|connected_accounts_provider_check/i.test(error.message)) {
        return NextResponse.json({ error: "Run supabase/migrations_add_user_smtp_accounts.sql in the Supabase SQL Editor, then try connecting again." }, { status: 503 });
      }
      if (/smtp_host|smtp_port|smtp_secure/i.test(error.message)) {
        return NextResponse.json({ error: "Run supabase/migrations_add_user_smtp_accounts.sql in the Supabase SQL Editor, then try connecting again." }, { status: 503 });
      }
      if (/TOKEN_ENCRYPTION_KEY/i.test(error.message)) return NextResponse.json({ error: "The server’s encryption key is not configured. Please contact support." }, { status: 503 });
      return NextResponse.json({ error: "Could not save this sending account. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    console.error("SMTP account verification failed", error instanceof Error ? { message: error.message, code: (error as NodeJS.ErrnoException).code } : error);
    const message = error instanceof Error ? error.message : "Could not connect to this SMTP server.";
    if (/TOKEN_ENCRYPTION_KEY/i.test(message)) return NextResponse.json({ error: "The server’s encryption key is not configured. Please contact support." }, { status: 503 });
    const friendly = /ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(message)
      ? "Couldn’t reach that mail server. Check the SMTP host and port."
      : /auth|credentials|username|password|535/i.test(message)
        ? "The mail server rejected these login details. Check the username and password."
        : /certificate|tls|ssl/i.test(message)
          ? "The secure connection could not be established. Check the SSL setting and port."
          : "Couldn’t connect to this mail server. Check the details and try again.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
