import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_DRAFTS_PER_REQUEST, generateDrafts, isAiConfigured } from "@/lib/ai";
import { AI_DAILY_LIMIT, addAiUsage, getAiUsage } from "@/lib/ai-usage";

// Generating several drafts can take a while on the free tier.
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
    return NextResponse.json({ error: "Invalid number of drafts." }, { status: 400 });
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
      { error: `Daily AI limit reached. You have ${left} draft${left === 1 ? "" : "s"} left today.` },
      { status: 429 }
    );
  }

  try {
    const drafts = await generateDrafts(prompt, count);
    await addAiUsage(user.id, count, used);
    return NextResponse.json({ ok: true, drafts, remaining: Math.max(0, AI_DAILY_LIMIT - used - count) });
  } catch {
    return NextResponse.json({ error: "The AI is busy right now. Please try again in a minute." }, { status: 502 });
  }
}
