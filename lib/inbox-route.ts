import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AccountAuthError, accountErrorInfo } from "@/lib/accounts";
import { GoogleReadScopeError } from "@/lib/google";
import { GmailApiError } from "@/lib/gmail-read";
import { InboxError } from "@/lib/inbox";

/**
 * Runs an Inbox request for the signed-in person and turns every failure into a clear message.
 * Only a missing session answers 401 (the page then sends the person to sign in); account and
 * permission problems answer 409 so they are never mistaken for a lost session.
 */
export async function inboxRoute(fn: (ctx: { supabase: SupabaseClient; user: User }) => Promise<unknown>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    return NextResponse.json(await fn({ supabase, user }));
  } catch (err) {
    if (err instanceof InboxError) return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    if (err instanceof GoogleReadScopeError) {
      return NextResponse.json({ error: "Allow Outbox to read replies for this Gmail account first.", needsPermission: true }, { status: 409 });
    }
    if (err instanceof AccountAuthError) {
      const info = accountErrorInfo(err);
      return NextResponse.json({ error: info.message, reconnect: info.reconnect }, { status: 409 });
    }
    const e = err as { code?: string; message?: string };
    if (/conversations|inbox_settings|inbox_enabled/i.test(e?.message ?? "") && /42P01|PGRST20\d|does not exist|schema cache/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) {
      return NextResponse.json({ error: "The database isn't ready for the Inbox yet. Run supabase/migrations_add_inbox.sql in the Supabase SQL Editor.", setup: true }, { status: 503 });
    }
    console.error("inbox: request failed", err);
    if (err instanceof GmailApiError) return NextResponse.json({ error: "Gmail did not answer. Please try again in a minute." }, { status: 502 });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
