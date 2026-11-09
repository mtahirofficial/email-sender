import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationError, assignItems, automationErrorResponse, computePending, getSettings, getSheetsAccess, listSenders, usedTodayByAccount } from "@/lib/automation";

export const maxDuration = 60;

// Reads the sheet fresh and hands the next unsent addresses to each sending account,
// up to what is left of that account's daily limit.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const settings = await getSettings(supabase, user.id, body?.automationId);
    if (!settings) throw new AutomationError("Import a sheet first.");

    const { accessToken } = await getSheetsAccess(supabase, user.id, settings.account_id);
    const { pool, stats } = await computePending(supabase, accessToken, settings);
    const senders = await listSenders(supabase, user.id, settings.id);
    const used = await usedTodayByAccount(supabase, settings);
    const plan = assignItems(pool, senders, used);

    return NextResponse.json({
      ok: true,
      items: plan.map(({ sender, item }) => ({ row: item.row, website: item.website, fields: item.fields, email: item.email, accountId: sender.accountId, fromEmail: sender.email })),
      prompt: settings.prompt,
      aiNotes: settings.ai_notes ?? "",
      stats,
      skipped: senders.filter((s) => s.enabled && s.needsReconnect).map((s) => s.email),
    });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
