import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sheetUrlFor } from "@/lib/sheets";
import { automationErrorResponse, computePending, getSettings, getSheetsAccess, usedTodayByAccount } from "@/lib/automation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id, request.nextUrl.searchParams.get("automationId"));
    if (!settings) return NextResponse.json({ configured: false });

    const { accessToken } = await getSheetsAccess(supabase, user.id, settings.account_id);
    const { stats } = await computePending(supabase, accessToken, settings);
    const used = Object.fromEntries(await usedTodayByAccount(supabase, settings));
    const sheetUrl = await sheetUrlFor(accessToken, settings.spreadsheet_id, settings.sheet_title);
    return NextResponse.json({ configured: true, stats, used, sheetUrl });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
