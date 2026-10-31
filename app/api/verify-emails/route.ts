import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyMany } from "@/lib/email-verify";

// Needs Node (raw sockets + DNS), not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_REQUEST = 25;
// Addresses one account may check per day. Probing from your server's IP at scale can get that IP
// blacklisted, so this keeps one user from doing it. Kept in memory: it resets when the server restarts.
const DAILY_LIMIT = Number(process.env.VERIFY_DAILY_LIMIT) || 300;

const usage = new Map<string, { day: string; count: number }>();
const today = () => new Date().toISOString().slice(0, 10);

function usedToday(userId: string) {
  const entry = usage.get(userId);
  return entry && entry.day === today() ? entry.count : 0;
}

async function currentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** How many checks are left today. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - usedToday(user.id)) });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const emails: string[] = Array.from(
    new Set<string>((Array.isArray(body?.emails) ? body.emails : []).filter((e: unknown): e is string => typeof e === "string").map((e: string) => e.trim()).filter(Boolean))
  );
  if (emails.length === 0) return NextResponse.json({ error: "Add at least one email address." }, { status: 400 });
  if (emails.length > MAX_PER_REQUEST) {
    return NextResponse.json({ error: `Send at most ${MAX_PER_REQUEST} addresses at a time.` }, { status: 400 });
  }

  const used = usedToday(user.id);
  if (used + emails.length > DAILY_LIMIT) {
    const left = Math.max(0, DAILY_LIMIT - used);
    return NextResponse.json(
      { error: `Daily verification limit reached (${DAILY_LIMIT} addresses a day). You have ${left} left today.`, remaining: left },
      { status: 429 }
    );
  }
  // Count before checking, so many parallel requests can't slip past the limit.
  usage.set(user.id, { day: today(), count: used + emails.length });

  const results = await verifyMany(emails);

  // If we reached for several mail servers and every one failed at the connection itself,
  // outbound port 25 is very likely blocked on this server.
  const probed = results.filter((r) => r.connectionFailed !== undefined);
  const portBlocked = probed.length >= 2 && probed.every((r) => r.connectionFailed === true);

  return NextResponse.json({
    results: results.map(({ email, status, detail }) => ({ email, status, detail })),
    portBlocked,
    remaining: Math.max(0, DAILY_LIMIT - usedToday(user.id)),
  });
}
