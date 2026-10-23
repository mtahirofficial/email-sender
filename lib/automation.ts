import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AccountAuthError, accountErrorInfo, getValidAccessToken } from "@/lib/accounts";
import { SheetsError, colIndex, parseSheet, readValues, writeCells, type SheetItem } from "@/lib/sheets";

export type OutreachSettings = {
  user_id: string;
  account_id: string | null;
  spreadsheet_id: string;
  sheet_title: string;
  website_col: string;
  email_col: string;
  sent_col: string;
  daily_limit: number;
  prompt: string;
  timezone: string;
};

export class AutomationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Turns thrown errors into a JSON response the UI can show. */
export function automationErrorResponse(err: unknown) {
  if (err instanceof AutomationError || err instanceof SheetsError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof AccountAuthError) {
    const info = accountErrorInfo(err);
    return NextResponse.json({ error: info.message, reconnect: info.reconnect }, { status: 400 });
  }
  console.error("automation error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function getSettings(supabase: SupabaseClient, userId: string): Promise<OutreachSettings | null> {
  const { data, error } = await supabase.from("outreach_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as OutreachSettings | null) ?? null;
}

/** Today's date (YYYY-MM-DD) in the user's timezone. */
export function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function sentTodayCount(supabase: SupabaseClient, settings: OutreachSettings): Promise<number> {
  const { count, error } = await supabase
    .from("outreach_sends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", settings.user_id)
    .eq("spreadsheet_id", settings.spreadsheet_id)
    .eq("sent_day", todayIn(settings.timezone));
  if (error) throw error;
  return count ?? 0;
}

/** Access token of the connected Google account, which must also have Sheets access. */
export async function getSheetsAccess(supabase: SupabaseClient, userId: string, accountId: string | null) {
  if (!accountId) throw new AutomationError("Choose a connected Gmail account first.");
  const { data: account } = await supabase
    .from("connected_accounts")
    .select("id, provider, sheets_enabled")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!account || account.provider !== "google" || !account.sheets_enabled) {
    throw new AutomationError("Enable Google Sheets access for this Gmail account first.");
  }
  const { accessToken, email } = await getValidAccessToken(supabase, userId, account.id);
  return { accessToken, fromEmail: email };
}

type Columns = Pick<OutreachSettings, "website_col" | "email_col" | "sent_col">;

export async function loadSheetItems(accessToken: string, spreadsheetId: string, title: string, cols: Columns): Promise<SheetItem[]> {
  const idx = { website: colIndex(cols.website_col), email: colIndex(cols.email_col), sent: colIndex(cols.sent_col) };
  const lastCol = String.fromCharCode(65 + Math.max(idx.website, idx.email, idx.sent));
  return parseSheet(await readValues(accessToken, spreadsheetId, title, lastCol), idx);
}

export type SheetStats = { total: number; websites: number; sent: number; pending: number };

/**
 * Reads the sheet and works out what is still to send. Addresses we already
 * emailed but could not tick in the sheet (an earlier write failed) are ticked
 * now and never sent twice.
 */
export async function computePending(
  supabase: SupabaseClient,
  accessToken: string,
  settings: OutreachSettings
): Promise<{ pending: SheetItem[]; stats: SheetStats }> {
  const items = await loadSheetItems(accessToken, settings.spreadsheet_id, settings.sheet_title, settings);

  const { data: sends } = await supabase
    .from("outreach_sends")
    .select("email")
    .eq("user_id", settings.user_id)
    .eq("spreadsheet_id", settings.spreadsheet_id);
  const alreadySent = new Set((sends ?? []).map((s) => (s.email as string).toLowerCase()));

  const unticked = items.filter((i) => !i.sent && alreadySent.has(i.email.toLowerCase()));
  if (unticked.length > 0) {
    try {
      await writeCells(accessToken, settings.spreadsheet_id, settings.sheet_title, settings.sent_col, unticked.map((i) => ({ row: i.row, text: "✓" })));
    } catch (err) {
      console.error("automation: could not back-fill ticks", err);
    }
  }

  const pending = items.filter((i) => !i.sent && !alreadySent.has(i.email.toLowerCase()));
  return {
    pending,
    stats: {
      total: items.length,
      websites: new Set(items.map((i) => i.website)).size,
      sent: items.length - pending.length,
      pending: pending.length,
    },
  };
}
