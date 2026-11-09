import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AccountAuthError, accountErrorInfo, getValidAccessToken, listConnectedAccounts, type Provider } from "@/lib/accounts";
import { GoogleScopeError, sendGmail } from "@/lib/google";
import { sendOutlookMail } from "@/lib/microsoft";
import { SheetsError, colIndex, paintSentCells, parseExtraCols, parseSheet, readValues, writeCells, type ExtraColumn, type SheetItem } from "@/lib/sheets";

export type OutreachSettings = {
  id: string;
  user_id: string;
  account_id: string | null; // the Gmail account that has Google Sheets access
  spreadsheet_id: string;
  sheet_title: string;
  website_col: string;
  email_col: string;
  sent_col: string;
  filter_col: string | null;
  filter_value: string | null;
  extra_cols?: ExtraColumn[]; // optional extra columns whose values the AI may use
  prompt: string;
  ai_notes?: string;
  timezone: string;
  schedule_enabled: boolean;
  schedule_time: string; // HH:MM in `timezone`
  send_saturday?: boolean; // also run on Saturdays (Sundays are always skipped)
  pause_seconds: number;
  last_scheduled_day: string | null;
  schedule_retry_at: string | null;
  schedule_error: string | null;
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

export async function listSettings(supabase: SupabaseClient, userId: string): Promise<OutreachSettings[]> {
  const { data, error } = await supabase.from("outreach_settings").select("*").eq("user_id", userId).order("updated_at", { ascending: true });
  if (error) throw error;
  return (data as OutreachSettings[] | null) ?? [];
}

export async function getSettings(supabase: SupabaseClient, userId: string, settingsId?: string | null): Promise<OutreachSettings | null> {
  let query = supabase.from("outreach_settings").select("*").eq("user_id", userId);
  if (settingsId) query = query.eq("id", settingsId);
  const { data, error } = await query.order("updated_at", { ascending: true }).limit(1).maybeSingle();
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

/** Access token of the connected Google account that also has Sheets access. */
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

// ---- reading the sheet -------------------------------------------------------

type SheetColumns = Pick<OutreachSettings, "spreadsheet_id" | "sheet_title" | "website_col" | "email_col" | "sent_col" | "filter_col" | "filter_value" | "extra_cols">;

export async function loadSheet(accessToken: string, s: SheetColumns) {
  const idx = { website: colIndex(s.website_col), email: colIndex(s.email_col), sent: colIndex(s.sent_col) };
  const filter = s.filter_col && s.filter_value?.trim() ? { col: colIndex(s.filter_col), value: s.filter_value.trim().toLowerCase() } : undefined;
  const extras = parseExtraCols(s.extra_cols).map((e) => ({ col: colIndex(e.col), header: e.header }));
  const last = Math.max(idx.website, idx.email, idx.sent, filter?.col ?? 0, ...extras.map((e) => e.col));
  const values = await readValues(accessToken, s.spreadsheet_id, s.sheet_title, String.fromCharCode(65 + last));
  return { items: parseSheet(values, { ...idx, filter, extras }), values, idx };
}

/** Appends "✓ address" to the sent cell of each row, keeping whatever is already there. */
export async function markSent(accessToken: string, settings: SheetColumns, emails: string[]) {
  if (emails.length === 0) return;
  const { items, values, idx } = await loadSheet(accessToken, settings);
  const wanted = new Set(emails.map((e) => e.toLowerCase()));

  const byRow = new Map<number, string[]>();
  for (const item of items) {
    if (!wanted.has(item.email) || item.sent) continue;
    byRow.set(item.row, [...(byRow.get(item.row) ?? []), item.email]);
  }

  const entries = [...byRow].map(([row, list]) => {
    const existing = (values[row - 1]?.[idx.sent] ?? "").trim();
    return { row, text: [existing, ...list.map((e) => `\u2713 ${e}`)].filter(Boolean).join(", ") };
  });
  await writeCells(accessToken, settings.spreadsheet_id, settings.sheet_title, settings.sent_col, entries);
}

/**
 * Colours the sent cell green for every address emailed today, and clears older green. So green always means
 * "sent today" and stays until the first send of the next day. A failure here never affects sending.
 */
export async function highlightSentToday(accessToken: string, supabase: SupabaseClient, settings: OutreachSettings) {
  try {
    const { data } = await supabase
      .from("outreach_sends")
      .select("email")
      .eq("user_id", settings.user_id)
      .eq("spreadsheet_id", settings.spreadsheet_id)
      .eq("sent_day", todayIn(settings.timezone));
    const sentToday = new Set((data ?? []).map((d) => (d.email as string).toLowerCase()));
    const { items } = await loadSheet(accessToken, settings);
    const rows = items.filter((i) => sentToday.has(i.email)).map((i) => i.row);
    await paintSentCells(accessToken, settings.spreadsheet_id, settings.sheet_title, settings.sent_col, rows);
  } catch (err) {
    console.error("automation: could not colour the sheet", err);
  }
}

export type SheetStats = { total: number; websites: number; sent: number; pending: number };

/**
 * Reads the sheet and works out what is still to send. Addresses we already
 * emailed but could not mark in the sheet (an earlier write failed) are marked
 * now and never sent twice. Addresses already waiting in the schedule queue are
 * left out of `pool`.
 */
export async function computePending(supabase: SupabaseClient, accessToken: string, settings: OutreachSettings) {
  const { items } = await loadSheet(accessToken, settings);

  const [{ data: sends }, { data: queued }] = await Promise.all([
    supabase.from("outreach_sends").select("email").eq("user_id", settings.user_id).eq("spreadsheet_id", settings.spreadsheet_id),
    supabase.from("outreach_queue").select("email").eq("user_id", settings.user_id).eq("spreadsheet_id", settings.spreadsheet_id).eq("status", "pending"),
  ]);
  const alreadySent = new Set((sends ?? []).map((s) => (s.email as string).toLowerCase()));
  const inQueue = new Set((queued ?? []).map((q) => (q.email as string).toLowerCase()));

  const unmarked = items.filter((i) => !i.sent && alreadySent.has(i.email));
  if (unmarked.length > 0) {
    try {
      await markSent(accessToken, settings, unmarked.map((i) => i.email));
    } catch (err) {
      console.error("automation: could not back-fill marks", err);
    }
  }

  const open = items.filter((i) => !i.sent && !alreadySent.has(i.email));
  const seen = new Set<string>();
  const pool = open.filter((i) => {
    if (inQueue.has(i.email) || seen.has(i.email)) return false;
    seen.add(i.email);
    return true;
  });

  const stats: SheetStats = {
    total: items.length,
    websites: new Set(items.map((i) => i.website)).size,
    sent: items.length - open.length,
    pending: open.length,
  };
  return { pool, stats };
}

// ---- sender accounts ---------------------------------------------------------

export type Sender = { accountId: string; email: string; provider: Provider; limit: number; enabled: boolean; needsReconnect: boolean };

/** A new sheet may choose from every connected account; a configured sheet uses only its saved assignments. */
export async function listSenders(supabase: SupabaseClient, userId: string, automationId?: string): Promise<Sender[]> {
  const accounts = await listConnectedAccounts(supabase, userId);
  const { data } = automationId
    ? await supabase.from("outreach_senders").select("account_id, daily_limit, enabled").eq("user_id", userId).eq("automation_id", automationId)
    : { data: null };
  const config = new Map((data ?? []).map((r) => [r.account_id as string, r]));
  return accounts.filter((a) => !automationId || config.has(a.id)).map((a) => ({
    accountId: a.id,
    email: a.email,
    provider: a.provider,
    limit: config.get(a.id)?.daily_limit ?? 20,
    enabled: config.get(a.id)?.enabled ?? true,
    needsReconnect: Boolean(a.needs_reconnect),
  }));
}

/** Emails each account has used today: already sent plus waiting in today's queue. */
export async function usedTodayByAccount(supabase: SupabaseClient, settings: OutreachSettings): Promise<Map<string, number>> {
  const day = todayIn(settings.timezone);
  const [{ data: sends }, { data: queued }] = await Promise.all([
    supabase.from("outreach_sends").select("account_id").eq("user_id", settings.user_id).eq("spreadsheet_id", settings.spreadsheet_id).eq("sent_day", day),
    supabase.from("outreach_queue").select("account_id").eq("user_id", settings.user_id).eq("spreadsheet_id", settings.spreadsheet_id).eq("day", day).eq("status", "pending"),
  ]);
  const used = new Map<string, number>();
  for (const row of [...(sends ?? []), ...(queued ?? [])]) {
    const id = row.account_id as string | null;
    if (id) used.set(id, (used.get(id) ?? 0) + 1);
  }
  return used;
}

/** Hands the next unsent addresses to each usable sender, up to what is left of its daily limit. */
export function assignItems(pool: SheetItem[], senders: Sender[], used: Map<string, number>) {
  const plan: { sender: Sender; item: SheetItem }[] = [];
  let cursor = 0;
  for (const sender of senders.filter((s) => s.enabled && !s.needsReconnect)) {
    const room = Math.max(0, sender.limit - (used.get(sender.accountId) ?? 0));
    for (let n = 0; n < room && cursor < pool.length; n++) plan.push({ sender, item: pool[cursor++] });
  }
  return plan;
}

// ---- sending -------------------------------------------------------------------

export async function sendViaAccount(
  ctx: { provider: Provider; email: string; accessToken: string },
  to: string,
  subject: string,
  body: string
) {
  if (ctx.provider === "google") {
    try {
      await sendGmail(ctx.accessToken, { fromEmail: ctx.email, to, subject, body });
    } catch (err) {
      // No "send email" permission: report it as an account problem so the UI offers Reconnect.
      if (err instanceof GoogleScopeError) throw new AccountAuthError("scope", ctx.provider, ctx.email, err.message);
      throw err;
    }
  } else await sendOutlookMail(ctx.accessToken, { to, subject, body });
}
