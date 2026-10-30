import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteUserGroqKey, getUserKeyHint, looksLikeGroqKey, saveUserGroqKey, verifyGroqKey } from "@/lib/ai-keys";
import { AI_DAILY_LIMIT, getAiUsage } from "@/lib/ai-usage";

// The browser never receives a saved key: it only learns whether one exists and its last 4 characters.

async function currentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Whether this user has their own key, plus how much of the shared free AI is left today. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { hasKey, hint } = await getUserKeyHint(user.id);
  let used = 0;
  try {
    used = await getAiUsage(user.id);
  } catch {
    // usage table missing: the status line just shows the full allowance
  }
  return NextResponse.json({
    hasKey,
    hint,
    limit: AI_DAILY_LIMIT,
    used,
    remaining: hasKey ? null : Math.max(0, AI_DAILY_LIMIT - used),
  });
}

/** Checks the key with Groq, then saves it (encrypted). */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!looksLikeGroqKey(key)) {
    return NextResponse.json({ error: "That doesn't look like a Groq API key. It starts with gsk_ (get one at console.groq.com/keys)." }, { status: 400 });
  }

  const check = await verifyGroqKey(key);
  if (check === "invalid") {
    return NextResponse.json({ error: "Groq did not accept this key. Check that you copied all of it." }, { status: 400 });
  }
  if (check === "unreachable") {
    return NextResponse.json({ error: "Could not reach Groq to check the key. Please try again in a minute." }, { status: 502 });
  }

  try {
    await saveUserGroqKey(user.id, key);
  } catch (err) {
    console.error("ai key: could not save", err);
    return NextResponse.json({ error: "Could not save the key. If this keeps happening, run supabase/migrations_add_user_ai_keys.sql." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hint: key.slice(-4) });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    await deleteUserGroqKey(user.id);
  } catch (err) {
    console.error("ai key: could not remove", err);
    return NextResponse.json({ error: "Could not remove the key. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
