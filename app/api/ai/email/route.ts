import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_DRAFTS_PER_REQUEST, aiErrorMessage, generateEmails, isAiConfigured, type AiContext } from "@/lib/ai";
import { addAiUsage, getAiAccess, type AiAccess } from "@/lib/ai-usage";

// Generating several emails can take a while on the free tier.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const count = Number(body?.count);

  if (prompt.length < 10) {
    return NextResponse.json({ error: "Describe the email in at least 10 characters." }, { status: 400 });
  }
  if (notes.length > 2000) return NextResponse.json({ error: "AI notes must be 2,000 characters or fewer." }, { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > MAX_DRAFTS_PER_REQUEST) {
    return NextResponse.json({ error: "Invalid number of emails." }, { status: 400 });
  }

  // Optional: one website per email (from the spreadsheet), mentioned in each subject.
  let contexts: AiContext[] = Array(count).fill(null);
  if (body?.contexts !== undefined) {
    // One entry per email: its website and the values of the extra sheet columns, by header.
    if (!Array.isArray(body.contexts) || body.contexts.length !== count) {
      return NextResponse.json({ error: "contexts must have one entry per email." }, { status: 400 });
    }
    contexts = body.contexts.map((c: { website?: unknown; fields?: unknown }): AiContext => {
      const website = typeof c?.website === "string" && c.website.trim() ? c.website.trim().slice(0, 100) : null;
      const fields: Record<string, string> = {};
      if (c?.fields && typeof c.fields === "object") {
        for (const [header, value] of Object.entries(c.fields as Record<string, unknown>).slice(0, 8)) {
          if (typeof value === "string" && value.trim()) fields[header.slice(0, 40)] = value.replace(/\s+/g, " ").trim().slice(0, 200);
        }
      }
      return { website, fields };
    });
  } else if (body?.websites !== undefined) {
    if (!Array.isArray(body.websites) || body.websites.length !== count) {
      return NextResponse.json({ error: "websites must have one entry per email." }, { status: 400 });
    }
    contexts = body.websites.map((w: unknown) => (typeof w === "string" && w.trim() ? w.trim().slice(0, 100) : null));
  }

  let access: AiAccess;
  try {
    access = await getAiAccess(user.id);
  } catch (err) {
    console.error("ai usage lookup failed", err);
    return NextResponse.json(
      { error: "AI usage tracking isn't set up. Run supabase/migrations_add_ai_usage.sql." },
      { status: 500 }
    );
  }
  // Without a key of their own, people share the app's free AI, so each gets a daily allowance.
  if (!access.ownKey && !isAiConfigured()) {
    return NextResponse.json({ error: "AI drafting isn't set up yet." }, { status: 503 });
  }
  if (access.limit !== null && access.used + count > access.limit) {
    const left = access.remaining ?? 0;
    return NextResponse.json(
      {
        error: `Daily free AI limit reached (${access.limit} drafts a day). You have ${left} left today. Want more? Add your own free Groq API key in Settings and your drafts are written with your key.`,
        limitReached: true,
      },
      { status: 429 }
    );
  }

  try {
    const items = await generateEmails(prompt, contexts, { groqKey: access.ownKey, notes });
    await addAiUsage(user.id, count, access.used);
    return NextResponse.json({
      ok: true,
      items,
      // null when the person's own key is used: Outbox puts no daily limit on it.
      remaining: access.limit === null ? null : Math.max(0, access.limit - access.used - count),
      usingOwnKey: Boolean(access.ownKey),
    });
  } catch (err) {
    console.error("ai: generation failed", err);
    return NextResponse.json({ error: aiErrorMessage(err, Boolean(access.ownKey)) }, { status: 502 });
  }
}
