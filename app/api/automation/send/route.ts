import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AccountAuthError, getValidAccessToken, markNeedsReconnect } from "@/lib/accounts";
import { logEmailAttempt } from "@/lib/email-logs";
import { AutomationError, automationErrorResponse, getSettings, getSheetsAccess, highlightSentToday, listSenders, markSent, sendViaAccount, todayIn, usedTodayByAccount } from "@/lib/automation";

export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PER_REQUEST = 10;

type Item = { row: number; website: string | null; email: string; subject: string; body: string; accountId: string };

// Sends up to 10 reviewed emails (one separate message each, from the account it was assigned to),
// records them, then marks them in the sheet.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const raw: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (raw.length === 0 || raw.length > MAX_PER_REQUEST) throw new AutomationError(`Send between 1 and ${MAX_PER_REQUEST} emails per request.`);

    const items: Item[] = raw.map((entry) => {
      const e = entry as Record<string, unknown>;
      const item: Item = {
        row: Number(e.row),
        website: typeof e.website === "string" && e.website ? e.website : null,
        email: typeof e.email === "string" ? e.email.trim() : "",
        subject: typeof e.subject === "string" ? e.subject.trim() : "",
        body: typeof e.body === "string" ? e.body.trim() : "",
        accountId: typeof e.accountId === "string" ? e.accountId : "",
      };
      if (!Number.isInteger(item.row) || item.row < 1 || !EMAIL.test(item.email) || !item.subject || !item.body || !item.accountId) {
        throw new AutomationError(`Every email needs an address, a sender, a subject and a message (check ${item.email || "row " + item.row}).`);
      }
      return item;
    });

    const settings = await getSettings(supabase, user.id);
    if (!settings) throw new AutomationError("Import a sheet first.");

    // Each sending account must stay inside its own daily limit.
    const senders = new Map((await listSenders(supabase, user.id)).map((s) => [s.accountId, s]));
    const used = await usedTodayByAccount(supabase, settings);
    const wanted = new Map<string, number>();
    for (const item of items) {
      const sender = senders.get(item.accountId);
      if (!sender || !sender.enabled) throw new AutomationError("One of the sending accounts is not available.");
      wanted.set(item.accountId, (wanted.get(item.accountId) ?? 0) + 1);
    }
    for (const [accountId, count] of wanted) {
      const sender = senders.get(accountId)!;
      if ((used.get(accountId) ?? 0) + count > sender.limit) {
        throw new AutomationError(`${sender.email} has reached its daily limit of ${sender.limit}.`, 429);
      }
    }

    // Never email an address twice (a saved draft may be resumed days later).
    const { data: already } = await supabase
      .from("outreach_sends")
      .select("email")
      .eq("user_id", user.id)
      .eq("spreadsheet_id", settings.spreadsheet_id)
      .in("email", items.map((i) => i.email.toLowerCase()));
    const alreadySent = new Set((already ?? []).map((r) => r.email as string));

    const day = todayIn(settings.timezone);
    const contexts = new Map<string, Awaited<ReturnType<typeof getValidAccessToken>>>();
    const results: { email: string; ok: boolean; error?: string }[] = [];
    const sentEmails: string[] = [];

    for (const item of items) {
      if (alreadySent.has(item.email.toLowerCase())) {
        results.push({ email: item.email, ok: false, error: "Already emailed before" });
        continue;
      }
      try {
        let ctx = contexts.get(item.accountId);
        if (!ctx) {
          ctx = await getValidAccessToken(supabase, user.id, item.accountId);
          contexts.set(item.accountId, ctx);
        }
        await sendViaAccount(ctx, item.email, item.subject, item.body);

        const { error } = await supabase.from("outreach_sends").insert({
          user_id: user.id,
          spreadsheet_id: settings.spreadsheet_id,
          row_number: item.row,
          website: item.website,
          email: item.email.toLowerCase(),
          sent_day: day,
          account_id: item.accountId,
        });
        if (error) console.error("automation: could not record send", error);

        await logEmailAttempt(supabase, { userId: user.id, accountId: item.accountId, fromEmail: ctx.email, toEmail: item.email, subject: item.subject, status: "sent" });
        sentEmails.push(item.email);
        results.push({ email: item.email, ok: true });
      } catch (err) {
        // A dead connection stops the whole request so the UI can offer "Reconnect" and keep the draft.
        if (err instanceof AccountAuthError) {
          if (err.reason === "scope") await markNeedsReconnect(supabase, item.accountId, true);
          throw err;
        }
        console.error("automation: send failed", err);
        await logEmailAttempt(supabase, {
          userId: user.id,
          accountId: item.accountId,
          fromEmail: senders.get(item.accountId)?.email ?? "unknown",
          toEmail: item.email,
          subject: item.subject,
          status: "failed",
          error: (err instanceof Error ? err.message : "Unknown error").slice(0, 500),
        });
        results.push({ email: item.email, ok: false, error: "Send failed" });
      }
    }

    // Emails are already out; if marking the sheet fails it is back-filled on the next analysis.
    let tickFailed = false;
    try {
      const { accessToken } = await getSheetsAccess(supabase, user.id, settings.account_id);
      await markSent(accessToken, settings, sentEmails);
      await highlightSentToday(accessToken, supabase, settings);
    } catch (err) {
      console.error("automation: could not mark the sheet", err);
      tickFailed = sentEmails.length > 0;
    }

    return NextResponse.json({ ok: true, results, tickFailed });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
