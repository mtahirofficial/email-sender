import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, getSettings, todayIn } from "@/lib/automation";
import { queueSummary, runTickForUser } from "@/lib/scheduler";

export const maxDuration = 60;

async function authed() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const settings = await getSettings(supabase, user.id, request.nextUrl.searchParams.get("automationId"));
    if (!settings) return NextResponse.json({ configured: false });
    return NextResponse.json({
      configured: true,
      error: settings.schedule_error,
      lastDay: settings.last_scheduled_day,
      queue: await queueSummary(supabase, user.id, settings.timezone, settings.spreadsheet_id),
    });
  } catch (err) {
    return automationErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const settings = await getSettings(supabase, user.id, body?.automationId);
    if (!settings) throw new AutomationError("Import a sheet first.");

    switch (body?.action) {
      case "save": {
        const time = typeof body.time === "string" ? body.time : "";
        const pause = Number(body.pauseSeconds);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AutomationError("Choose a valid time.");
        if (!Number.isInteger(pause) || pause < 20 || pause > 900) throw new AutomationError("The pause must be between 20 and 900 seconds.");
        const timezone = typeof body.timezone === "string" && body.timezone ? body.timezone : settings.timezone;

        const fields = { schedule_enabled: body.enabled === true, schedule_time: time, pause_seconds: pause, timezone, schedule_error: null, schedule_retry_at: null };
        const sendSaturday = body.sendSaturday === true;
        let { error } = await supabase.from("outreach_settings").update({ ...fields, send_saturday: sendSaturday }).eq("id", settings.id).eq("user_id", user.id);
        if (error && /send_saturday/i.test(error.message ?? "")) {
          // the column does not exist yet (migration not run): saving still works, Saturday just stays off
          if (sendSaturday) throw new AutomationError("To send on Saturday, run supabase/migrations_add_send_saturday.sql in the Supabase SQL Editor first.");
          ({ error } = await supabase.from("outreach_settings").update(fields).eq("id", settings.id).eq("user_id", user.id));
        }
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "run-now": {
        if (!settings.schedule_enabled) throw new AutomationError("Turn the schedule on and save it first.");
        const result = await runTickForUser(createAdminClient(), user.id, { force: true, automationId: settings.id });
        return NextResponse.json({ ok: true, ...result });
      }

      case "cancel": {
        const { error } = await createAdminClient().from("outreach_queue").delete().eq("user_id", user.id).eq("spreadsheet_id", settings.spreadsheet_id).eq("status", "pending");
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "cancel-account": {
        if (typeof body.accountId !== "string" || !body.accountId) throw new AutomationError("Choose a sending account.");
        const day = todayIn(settings.timezone);
        const admin = createAdminClient();
        const cancelQueued = () => admin
          .from("outreach_queue")
          .delete()
          .eq("user_id", user.id)
          .eq("spreadsheet_id", settings.spreadsheet_id)
          .eq("day", day)
          .eq("account_id", body.accountId)
          .eq("status", "pending");
        const firstTry = await cancelQueued().is("sending_at", null);
        const result = firstTry.error && /sending_at/i.test(firstTry.error.message ?? "")
          ? await cancelQueued() // older installs do not have the in-progress marker
          : firstTry;
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }

      default:
        throw new AutomationError("Unknown action.");
    }
  } catch (err) {
    return automationErrorResponse(err);
  }
}
