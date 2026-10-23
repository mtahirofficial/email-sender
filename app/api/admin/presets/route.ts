import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { dbErrorMessage } from "@/lib/db-error";
import { DEFAULT_PRESETS } from "@/content/ai-presets";

const UUID = /^[0-9a-f-]{36}$/i;

// One endpoint for everything the admin does with presets: create, update, delete, restore defaults.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();
  const fail = (error: { code?: string; message: string }) =>
    NextResponse.json({ error: dbErrorMessage(error, "Could not save"), }, { status: 500 });

  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const fieldsOk = label.length >= 2 && label.length <= 40 && prompt.length >= 10 && prompt.length <= 1500;
  const fieldsError = "Name must be 2 to 40 characters and the prompt 10 to 1500.";

  switch (body?.action) {
    case "create": {
      if (!fieldsOk) return NextResponse.json({ error: fieldsError }, { status: 400 });
      const { data: last } = await admin.from("ai_presets").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { error } = await admin.from("ai_presets").insert({ label, prompt, sort_order: (last?.sort_order ?? 0) + 10 });
      return error ? fail(error) : NextResponse.json({ ok: true });
    }

    case "update": {
      if (!UUID.test(String(body.id)) || !fieldsOk) return NextResponse.json({ error: fieldsError }, { status: 400 });
      const order = Number(body.sort_order);
      const { error } = await admin
        .from("ai_presets")
        .update({
          label,
          prompt,
          active: body.active !== false,
          sort_order: Number.isFinite(order) ? Math.trunc(order) : 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id);
      return error ? fail(error) : NextResponse.json({ ok: true });
    }

    case "delete": {
      if (!UUID.test(String(body.id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const { error } = await admin.from("ai_presets").delete().eq("id", body.id);
      return error ? fail(error) : NextResponse.json({ ok: true });
    }

    case "restore": {
      // Adds any built-in preset that is missing; never touches ones you have edited.
      const { data: existing, error: readError } = await admin.from("ai_presets").select("slug");
      if (readError) return fail(readError);
      const have = new Set((existing ?? []).map((r) => r.slug as string));
      const rows = DEFAULT_PRESETS.map((p, i) => ({ slug: p.slug, label: p.label, prompt: p.prompt, sort_order: (i + 1) * 10 })).filter((r) => !have.has(r.slug));
      if (rows.length > 0) {
        const { error } = await admin.from("ai_presets").insert(rows);
        if (error) return fail(error);
      }
      return NextResponse.json({ ok: true, added: rows.length });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
