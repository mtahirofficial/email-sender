import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, computePending, getSheetsAccess, type OutreachSettings } from "@/lib/automation";
import { EXTRA_COLUMN_LIMIT, parseExtraCols, parseSpreadsheetUrl, resolveSheetTitle } from "@/lib/sheets";

export const maxDuration = 60;

const COLUMN = /^[A-Za-z]$/;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const parsedUrl = parseSpreadsheetUrl(str(body?.sheetUrl));
    if (!parsedUrl) throw new AutomationError("That doesn't look like a Google Sheets link.");

    const cols = [str(body?.websiteCol), str(body?.emailCol), str(body?.sentCol)];
    if (!cols.every((c) => COLUMN.test(c))) throw new AutomationError("Columns must be single letters, like B, E and F.");
    const [websiteCol, emailCol, sentCol] = cols.map((c) => c.toUpperCase());
    if (new Set([websiteCol, emailCol, sentCol]).size !== 3) throw new AutomationError("The website, emails and sent columns must be different.");

    // Optional extra columns (a letter + the header the person uses for it in their instructions).
    const extraCols = parseExtraCols(body?.extraCols);
    const asked = Array.isArray(body?.extraCols) ? body.extraCols.length : 0;
    if (asked > extraCols.length) {
      throw new AutomationError(`Each extra column needs its own letter (A to Z) and its own header of up to 40 characters, with at most ${EXTRA_COLUMN_LIMIT} columns.`);
    }
    for (const extra of extraCols) {
      if ([websiteCol, emailCol, sentCol].includes(extra.col)) throw new AutomationError(`Column ${extra.col} is already used for the website, emails or sent marks. Pick another letter for "${extra.header}".`);
      if (extra.header.toLowerCase() === "website") throw new AutomationError('"Website" is already used for the domain column. Give the extra column another header.');
    }

    // Optional filter, for example only rows where the "Guest Post?" column says Yes.
    const filterColRaw = str(body?.filterCol);
    const filterValue = str(body?.filterValue);
    if (filterColRaw && !COLUMN.test(filterColRaw)) throw new AutomationError("The filter column must be a single letter, or empty.");
    const useFilter = Boolean(filterColRaw && filterValue);

    const prompt = str(body?.prompt);
    if (prompt.length < 10) throw new AutomationError("Describe what the emails should say in at least 10 characters.");
    const aiNotes = str(body?.aiNotes);
    if (aiNotes.length > 2000) throw new AutomationError("AI notes must be 2,000 characters or fewer.");
    const autoFollowUp = body?.autoFollowUp === true;
    const followUpAfterDays = Math.min(30, Math.max(1, Math.round(Number(body?.followUpAfterDays) || 4)));
    const maxFollowUps = Math.min(5, Math.max(0, Math.round(Number(body?.maxFollowUps) || 2)));

    const timezone = str(body?.timezone) || "UTC";
    const accountId = str(body?.accountId);

    // Prove we can open the sheet before saving anything.
    const { accessToken } = await getSheetsAccess(supabase, user.id, accountId);
    const sheetTitle = await resolveSheetTitle(accessToken, parsedUrl.id, parsedUrl.gid);

    const settings = {
      user_id: user.id,
      account_id: accountId,
      spreadsheet_id: parsedUrl.id,
      sheet_title: sheetTitle,
      website_col: websiteCol,
      email_col: emailCol,
      sent_col: sentCol,
      filter_col: useFilter ? filterColRaw.toUpperCase() : null,
      filter_value: useFilter ? filterValue : null,
      extra_cols: extraCols,
      prompt,
      ai_notes: aiNotes,
      auto_follow_up: autoFollowUp,
      follow_up_after_days: followUpAfterDays,
      max_follow_ups: maxFollowUps,
      timezone,
    } as OutreachSettings;

    const { stats } = await computePending(supabase, accessToken, settings);
    if (stats.total === 0) {
      throw new AutomationError(`No email addresses found in column ${emailCol} of "${sheetTitle}"${useFilter ? ` (rows where column ${filterColRaw.toUpperCase()} is "${filterValue}")` : ""}. Check the column letters.`);
    }

    let { data: saved, error } = await supabase.from("outreach_settings").upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id,spreadsheet_id" }).select("*").single();
    if (error && /extra_cols/i.test(error.message ?? "")) {
      // the column does not exist yet (migration not run): everything else still saves
      if (extraCols.length > 0) throw new AutomationError("To use extra columns, run supabase/migrations_add_extra_columns.sql in the Supabase SQL Editor first.");
      const { extra_cols: _unused, ...rest } = settings as OutreachSettings & { extra_cols?: unknown };
      void _unused;
      ({ data: saved, error } = await supabase.from("outreach_settings").upsert({ ...rest, updated_at: new Date().toISOString() }, { onConflict: "user_id,spreadsheet_id" }).select("*").single());
    }
    if (error && /ai_notes/i.test(error.message ?? "")) throw new AutomationError("To use automation AI notes, run supabase/migrations_add_automation_ai_notes.sql in the Supabase SQL Editor first.");
    if (error && /auto_follow_up|follow_up_after_days|max_follow_ups/i.test(error.message ?? "")) throw new AutomationError("To use automatic follow-ups, run supabase/migrations_add_automation_followups.sql in the Supabase SQL Editor first.");
    if (error) throw error;

    return NextResponse.json({ ok: true, settings: saved, sheetTitle, stats });
  } catch (err) {
    return automationErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const automationId = request.nextUrl.searchParams.get("automationId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(automationId)) throw new AutomationError("Choose a sheet to remove.");

    const { data: sheet, error: lookupError } = await supabase
      .from("outreach_settings")
      .select("id, spreadsheet_id")
      .eq("id", automationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!sheet) throw new AutomationError("This sheet was not found.", 404);

    // The service client is used only after verifying this sheet belongs to the signed-in user.
    const admin = createAdminClient();
    const cleanups = await Promise.all([
      admin.from("outreach_queue").delete().eq("user_id", user.id).eq("spreadsheet_id", sheet.spreadsheet_id).eq("status", "pending"),
      admin.from("outreach_drafts").delete().eq("user_id", user.id).eq("spreadsheet_id", sheet.spreadsheet_id),
      admin.from("outreach_senders").delete().eq("user_id", user.id).eq("automation_id", automationId),
    ]);
    const cleanupError = cleanups.find((result) => result.error)?.error;
    if (cleanupError) throw cleanupError;

    const { error: deleteError } = await admin.from("outreach_settings").delete().eq("id", automationId).eq("user_id", user.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
