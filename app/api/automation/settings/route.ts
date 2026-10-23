import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, computePending, getSheetsAccess, sentTodayCount, type OutreachSettings } from "@/lib/automation";
import { parseSpreadsheetUrl, resolveSheetTitle } from "@/lib/sheets";

export const maxDuration = 60;

const COLUMN = /^[A-Za-z]$/;

export async function POST(request: NextRequest) {
  const supabase = createClient();
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
    if (!cols.every((c) => COLUMN.test(c))) throw new AutomationError("Columns must be single letters, like B, C and D.");
    const [websiteCol, emailCol, sentCol] = cols.map((c) => c.toUpperCase());
    if (new Set([websiteCol, emailCol, sentCol]).size !== 3) throw new AutomationError("The three columns must be different.");

    const dailyLimit = Number(body?.dailyLimit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 200) throw new AutomationError("Daily limit must be between 1 and 200.");

    const prompt = str(body?.prompt);
    if (prompt.length < 10 || prompt.length > 1500) throw new AutomationError("Describe what the emails should say in 10 to 1500 characters.");

    const timezone = str(body?.timezone) || "UTC";
    const accountId = str(body?.accountId);

    // Prove we can open the sheet before saving anything.
    const { accessToken } = await getSheetsAccess(supabase, user.id, accountId);
    const sheetTitle = await resolveSheetTitle(accessToken, parsedUrl.id, parsedUrl.gid);

    const settings: OutreachSettings = {
      user_id: user.id,
      account_id: accountId,
      spreadsheet_id: parsedUrl.id,
      sheet_title: sheetTitle,
      website_col: websiteCol,
      email_col: emailCol,
      sent_col: sentCol,
      daily_limit: dailyLimit,
      prompt,
      timezone,
    };

    const { stats } = await computePending(supabase, accessToken, settings);
    if (stats.total === 0) {
      throw new AutomationError(`No email addresses found in column ${emailCol} of "${sheetTitle}". Check the column letters.`);
    }

    const { error } = await supabase
      .from("outreach_settings")
      .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;

    return NextResponse.json({ ok: true, sheetTitle, stats, sentToday: await sentTodayCount(supabase, settings) });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
