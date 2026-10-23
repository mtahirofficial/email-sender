import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AutomationError, automationErrorResponse, getSettings } from "@/lib/automation";

// The reviewed-but-unsent batch lives here, so a connection problem (or closing the tab)
// never means the AI has to write everything again.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authed() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id);
    const { data, error } = await supabase.from("outreach_drafts").select("spreadsheet_id, items, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;

    // A draft for a different sheet than the one linked now is no longer relevant.
    if (!data || !settings || data.spreadsheet_id !== settings.spreadsheet_id || !Array.isArray(data.items) || data.items.length === 0) {
      return NextResponse.json({ draft: null });
    }
    return NextResponse.json({ draft: { items: data.items, updatedAt: data.updated_at } });
  } catch (err) {
    return automationErrorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id);
    if (!settings) throw new AutomationError("Import a sheet first.");

    const body = await request.json().catch(() => null);
    const raw: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (raw.length > 200) throw new AutomationError("Too many emails in one draft.");

    const items = raw.map((entry) => {
      const e = entry as Record<string, unknown>;
      const row = Number(e.row);
      const email = typeof e.email === "string" ? e.email.trim() : "";
      if (!Number.isInteger(row) || row < 1 || !EMAIL.test(email)) throw new AutomationError("Invalid draft.");
      return {
        row,
        website: typeof e.website === "string" && e.website ? e.website.slice(0, 200) : null,
        email,
        subject: typeof e.subject === "string" ? e.subject.slice(0, 300) : "",
        body: typeof e.body === "string" ? e.body.slice(0, 8000) : "",
        skip: e.skip === true,
        status: e.status === "sent" || e.status === "failed" ? e.status : undefined,
      };
    });

    const { error } = await supabase
      .from("outreach_drafts")
      .upsert({ user_id: user.id, spreadsheet_id: settings.spreadsheet_id, items, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return automationErrorResponse(err);
  }
}

export async function DELETE() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { error } = await supabase.from("outreach_drafts").delete().eq("user_id", user.id);
  if (error) console.error("draft delete failed", error);
  return NextResponse.json({ ok: true });
}
