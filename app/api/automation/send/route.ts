import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendGmail } from "@/lib/google";
import { logEmailAttempt } from "@/lib/email-logs";
import { writeCells } from "@/lib/sheets";
import { AutomationError, automationErrorResponse, getSettings, getSheetsAccess, loadSheetItems, sentTodayCount, todayIn } from "@/lib/automation";

export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PER_REQUEST = 10;

type Item = { row: number; website: string | null; email: string; subject: string; body: string };

// Sends up to 10 reviewed emails (one separate message each), records them, then ticks the sheet.
export async function POST(request: NextRequest) {
  const supabase = createClient();
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
      };
      if (!Number.isInteger(item.row) || item.row < 1 || !EMAIL.test(item.email) || !item.subject || !item.body) {
        throw new AutomationError(`Every email needs an address, a subject and a message (check ${item.email || "row " + item.row}).`);
      }
      return item;
    });

    const settings = await getSettings(supabase, user.id);
    if (!settings) throw new AutomationError("Import a sheet first.");

    const sentToday = await sentTodayCount(supabase, settings);
    if (sentToday + items.length > settings.daily_limit) {
      throw new AutomationError(`Daily limit reached: ${sentToday} of ${settings.daily_limit} already sent today.`, 429);
    }

    const { accessToken, fromEmail } = await getSheetsAccess(supabase, user.id, settings.account_id);
    const day = todayIn(settings.timezone);

    const results: { email: string; ok: boolean; error?: string }[] = [];
    const ticks: { row: number; text: string }[] = [];

    const { data: already } = await supabase
      .from("outreach_sends")
      .select("email")
      .eq("user_id", user.id)
      .eq("spreadsheet_id", settings.spreadsheet_id)
      .in("email", items.map((i) => i.email.toLowerCase()));
    const alreadySent = new Set((already ?? []).map((r) => r.email as string));

    for (const item of items) {
      if (alreadySent.has(item.email.toLowerCase())) {
        results.push({ email: item.email, ok: false, error: "Already emailed before" });
        continue;
      }
      try {
        await sendGmail(accessToken, { fromEmail, to: item.email, subject: item.subject, body: item.body });

        const { error } = await supabase.from("outreach_sends").insert({
          user_id: user.id,
          spreadsheet_id: settings.spreadsheet_id,
          row_number: item.row,
          website: item.website,
          email: item.email.toLowerCase(),
          sent_day: day,
        });
        if (error) console.error("automation: could not record send", error);

        await logEmailAttempt(supabase, {
          userId: user.id,
          accountId: settings.account_id ?? "",
          fromEmail,
          toEmail: item.email,
          subject: item.subject,
          status: "sent",
        });
        ticks.push({ row: item.row, text: `✓ ${day}` });
        results.push({ email: item.email, ok: true });
      } catch (err) {
        console.error("automation: send failed", err);
        await logEmailAttempt(supabase, {
          userId: user.id,
          accountId: settings.account_id ?? "",
          fromEmail,
          toEmail: item.email,
          subject: item.subject,
          status: "failed",
          error: (err instanceof Error ? err.message : "Unknown error").slice(0, 500),
        });
        results.push({ email: item.email, ok: false, error: "Send failed" });
      }
    }

    // Emails are already out; if the tick fails it is back-filled on the next analysis.
    let tickFailed = false;
    try {
      if (ticks.length > 0) {
        const current = await loadSheetItems(accessToken, settings.spreadsheet_id, settings.sheet_title, settings);
        const rowByEmail = new Map<string, number>();
        for (const entry of current) if (!rowByEmail.has(entry.email.toLowerCase())) rowByEmail.set(entry.email.toLowerCase(), entry.row);

        const text = ticks[0].text;
        const located = items
          .filter((i) => ticks.some((t) => t.row === i.row))
          .map((i) => ({ row: rowByEmail.get(i.email.toLowerCase()), text }))
          .filter((t): t is { row: number; text: string } => typeof t.row === "number");
        await writeCells(accessToken, settings.spreadsheet_id, settings.sheet_title, settings.sent_col, located);
        if (located.length < ticks.length) tickFailed = true;
      }
    } catch (err) {
      console.error("automation: could not write ticks", err);
      tickFailed = true;
    }

    return NextResponse.json({ ok: true, results, tickFailed, sentToday: sentToday + ticks.length, limit: settings.daily_limit });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
