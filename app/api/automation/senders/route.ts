import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, listSenders } from "@/lib/automation";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const input: unknown[] = Array.isArray(body?.senders) ? body.senders : [];
    const mine = new Set((await listSenders(supabase, user.id)).map((s) => s.accountId));

    const rows = input.map((entry) => {
      const e = entry as Record<string, unknown>;
      const limit = Number(e.limit);
      if (typeof e.accountId !== "string" || !mine.has(e.accountId)) throw new AutomationError("Unknown account.");
      if (!Number.isInteger(limit) || limit < 0 || limit > 500) throw new AutomationError("Each limit must be a whole number from 0 to 500.");
      return { user_id: user.id, account_id: e.accountId, daily_limit: limit, enabled: e.enabled !== false };
    });

    const { error } = await supabase.from("outreach_senders").upsert(rows, { onConflict: "user_id,account_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
