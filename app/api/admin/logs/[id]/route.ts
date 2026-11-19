import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { deleteAppErrorLog } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return NextResponse.json({ error: "Invalid log entry." }, { status: 400 });
  const removed = await deleteAppErrorLog(id);
  if (!removed) return NextResponse.json({ error: "This log entry was already removed." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
