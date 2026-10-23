import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, computePending, getSettings, getSheetsAccess, sentTodayCount } from "@/lib/automation";

export const maxDuration = 60;

// Reads the sheet fresh and returns the next unsent addresses that still fit in today's limit.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id);
    if (!settings) throw new AutomationError("Import a sheet first.");

    const { accessToken } = await getSheetsAccess(supabase, user.id, settings.account_id);
    const { pending, stats } = await computePending(supabase, accessToken, settings);
    const sentToday = await sentTodayCount(supabase, settings);
    const room = Math.max(0, settings.daily_limit - sentToday);
    const seen = new Set<string>();
    const unique = pending.filter((i) => {
      const key = i.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      ok: true,
      items: unique.slice(0, room).map(({ row, website, email }) => ({ row, website, email })),
      prompt: settings.prompt,
      sentToday,
      limit: settings.daily_limit,
      stats,
    });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
