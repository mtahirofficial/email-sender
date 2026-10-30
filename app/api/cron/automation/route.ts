import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { recordHeartbeat, runTickForAll } from "@/lib/scheduler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // not configured
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret") ?? request.nextUrl.searchParams.get("key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Call this every 5 minutes (see the README). It writes today's emails once it is time
// and sends whatever is due, for everyone who has the schedule on.
async function handle(request: NextRequest) {
  const ok = authorised(request);
  if (ok === null) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const admin = createAdminClient();
  await recordHeartbeat(admin);
  return NextResponse.json({ ok: true, ...(await runTickForAll(admin)) });
}

export const GET = handle;
export const POST = handle;
