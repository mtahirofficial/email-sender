import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await createAdminClient().from("contact_messages").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Could not delete the message." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
