import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_DRAFTS_PER_REQUEST, generateEmails, isAiConfigured } from "@/lib/ai";
import { AI_DAILY_LIMIT, addAiUsage, getAiUsage } from "@/lib/ai-usage";

// Generating several emails can take a while on the free tier.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI drafting isn't set up yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const count = Number(body?.count);

  if (prompt.length < 10 || prompt.length > 1500) {
    return NextResponse.json({ error: "Describe the email in 10 to 1500 characters." }, { status: 400 });
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_DRAFTS_PER_REQUEST) {
    return NextResponse.json({ error: "Invalid number of emails." }, { status: 400 });
  }

  // Optional: one website per email (from the spreadsheet), mentioned in each subject.
  let contexts: (string | null)[] = Array(count).fill(null);
  if (body?.websites !== undefined) {
    if (!Array.isArray(body.websites) || body.websites.length !== count) {
      return NextResponse.json({ error: "websites must have one entry per email." }, { status: 400 });
    }
    contexts = body.websites.map((w: unknown) => (typeof w === "string" && w.trim() ? w.trim().slice(0, 100) : null));
  }

  let used: number;
  try {
    used = await getAiUsage(user.id);
  } catch (err) {
    console.error("ai usage lookup failed", err);
    return NextResponse.json(
      { error: "AI usage tracking isn't set up. Run supabase/migrations_add_ai_usage.sql." },
      { status: 500 }
    );
  }
  if (used + count > AI_DAILY_LIMIT) {
    const left = Math.max(0, AI_DAILY_LIMIT - used);
    return NextResponse.json(
      { error: `Daily AI limit reached. You have ${left} email${left === 1 ? "" : "s"} left today.` },
      { status: 429 }
    );
  }

  try {
    const items = await generateEmails(prompt, contexts);
    await addAiUsage(user.id, count, used);
    return NextResponse.json({ ok: true, items, remaining: Math.max(0, AI_DAILY_LIMIT - used - count) });
  } catch {
    return NextResponse.json({ error: "The AI is busy right now. Please try again in a minute." }, { status: 502 });
  }
}
