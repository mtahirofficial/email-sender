import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { runTickForUser } from "@/lib/scheduler";
import { automationErrorResponse } from "@/lib/automation";

export const maxDuration = 60;

// Lets an open Automation page drive the schedule too (no cron needed while it stays open).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await runTickForUser(createAdminClient(), user.id)) });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
