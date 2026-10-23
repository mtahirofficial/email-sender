import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { automationErrorResponse, computePending, getSettings, getSheetsAccess, sentTodayCount } from "@/lib/automation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id);
    if (!settings) return NextResponse.json({ configured: false });

    const { accessToken } = await getSheetsAccess(supabase, user.id, settings.account_id);
    const { stats } = await computePending(supabase, accessToken, settings);
    return NextResponse.json({ configured: true, stats, sentToday: await sentTodayCount(supabase, settings), limit: settings.daily_limit });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
