import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AccountAuthError, accountErrorInfo } from "@/lib/accounts";
import { GoogleModifyScopeError, GoogleReadScopeError } from "@/lib/google";
import { GmailApiError } from "@/lib/gmail-read";
import { InboxError } from "@/lib/inbox";
import { writeAppErrorLog } from "@/lib/error-log";

/**
 * Runs an Inbox request for the signed-in person and turns every failure into a clear message.
 * Only a missing session answers 401 (the page then sends the person to sign in); account and
 * permission problems answer 409 so they are never mistaken for a lost session.
 */
export async function inboxRoute(fn: (ctx: { supabase: SupabaseClient; user: User }) => Promise<unknown>, request?: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const result = await fn({ supabase, user });
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (err) {
    if (err instanceof InboxError) {
      if (request) await writeAppErrorLog({ request, error: err, responseStatus: err.status, responseMessage: err.message, userId: user.id });
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    if (err instanceof GoogleModifyScopeError) {
      if (request) await writeAppErrorLog({ request, error: err, responseStatus: 409, responseMessage: "Google permission is missing.", userId: user.id });
      return NextResponse.json({
        error: "Google hasn't granted permission to change messages for this Gmail account. Reconnect it and allow Inbox access to mark messages read or star them.",
        needsPermission: true,
      }, { status: 409 });
    }
    if (err instanceof GoogleReadScopeError) {
      if (request) await writeAppErrorLog({ request, error: err, responseStatus: 409, responseMessage: "Google permission is missing.", userId: user.id });
      return NextResponse.json({ error: "Allow Outbox to manage this Gmail inbox first.", needsPermission: true }, { status: 409 });
    }
    if (err instanceof AccountAuthError) {
      const info = accountErrorInfo(err);
      if (request) await writeAppErrorLog({ request, error: err, responseStatus: 409, responseMessage: info.message, userId: user.id });
      return NextResponse.json({ error: info.message, reconnect: info.reconnect }, { status: 409 });
    }
    const e = err as { code?: string; message?: string };
    if (/conversations|inbox_settings|inbox_enabled/i.test(e?.message ?? "") && /42P01|PGRST20\d|does not exist|schema cache/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) {
      if (request) await writeAppErrorLog({ request, error: err, responseStatus: 503, responseMessage: "Inbox setup is incomplete.", userId: user.id });
      return NextResponse.json({ error: "Inbox is still being set up. Please try again later or contact support.", setup: true }, { status: 503 });
    }
    console.error("inbox: request failed", err);
    const message = err instanceof GmailApiError ? "Gmail couldn’t finish loading this. Please try again in a moment." : "Something went wrong. Please try again.";
    if (request) await writeAppErrorLog({ request, error: err, responseStatus: err instanceof GmailApiError ? 502 : 500, responseMessage: message, userId: user.id });
    if (err instanceof GmailApiError) return NextResponse.json({ error: message }, { status: 502 });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
