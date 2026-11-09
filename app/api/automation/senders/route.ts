import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse } from "@/lib/automation";
import { listConnectedAccounts } from "@/lib/accounts";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const automationId = typeof body?.automationId === "string" ? body.automationId : "";
    if (!automationId) throw new AutomationError("Choose a linked sheet first.");
    const { data: settings } = await supabase.from("outreach_settings").select("id, spreadsheet_id").eq("id", automationId).eq("user_id", user.id).maybeSingle();
    if (!settings) throw new AutomationError("This linked sheet was not found.", 404);
    const input: unknown[] = Array.isArray(body?.senders) ? body.senders : [];
    const mine = new Set((await listConnectedAccounts(supabase, user.id)).map((account) => account.id));

    const rows = input.map((entry) => {
      const e = entry as Record<string, unknown>;
      const limit = Number(e.limit);
      if (typeof e.accountId !== "string" || !mine.has(e.accountId)) throw new AutomationError("Unknown account.");
      if (!Number.isInteger(limit) || limit < 0 || limit > 500) throw new AutomationError("Each limit must be a whole number from 0 to 500.");
      return { user_id: user.id, automation_id: automationId, account_id: e.accountId, daily_limit: limit, enabled: e.enabled !== false };
    });

    const { data: existing, error: existingError } = await supabase
      .from("outreach_senders")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("automation_id", automationId);
    if (existingError) throw existingError;

    if (rows.length > 0) {
      const { error } = await supabase.from("outreach_senders").upsert(rows, { onConflict: "automation_id,account_id" });
      if (error) throw error;
    }

    const kept = new Set(rows.map((row) => row.account_id));
    const removed = (existing ?? []).map((row) => row.account_id as string).filter((id) => !kept.has(id));
    if (removed.length > 0) {
      const admin = createAdminClient();
      const cancelQueued = () => admin
        .from("outreach_queue")
        .delete()
        .eq("user_id", user.id)
        .eq("spreadsheet_id", settings.spreadsheet_id)
        .in("account_id", removed)
        .eq("status", "pending");
      const firstTry = await cancelQueued().is("sending_at", null);
      const queueResult = firstTry.error && /sending_at/i.test(firstTry.error.message ?? "")
        ? await cancelQueued()
        : firstTry;
      if (queueResult.error) throw queueResult.error;

      const { error } = await supabase
        .from("outreach_senders")
        .delete()
        .eq("user_id", user.id)
        .eq("automation_id", automationId)
        .in("account_id", removed);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
