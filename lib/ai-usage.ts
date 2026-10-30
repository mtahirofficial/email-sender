import { createAdminClient } from "@/lib/supabase/server";
import { getUserGroqKey } from "@/lib/ai-keys";

/**
 * Drafts one user may write per UTC day with the SHARED free AI (the app's own keys).
 *
 * How 40 was chosen: the shared free quota is the sum of the free daily token allowances of the
 * models in use. Groq gives 200,000 tokens per day to each of gpt-oss-120b, gpt-oss-20b and Qwen
 * (about 600,000 in all). A draft costs roughly 500 tokens, so that is about 1,200 drafts a day.
 * For 20 users, keeping a safety margin (not everyone writes at the same time, and rate limits
 * can waste some), 40 each is about 800 drafts, two thirds of Groq's allowance, with Gemini and
 * Mistral as extra room. Override with AI_DAILY_LIMIT.
 *
 * Users who add their own Groq key are not limited here: Groq limits their own key.
 */
export const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 40;

const today = () => new Date().toISOString().slice(0, 10);

export async function getAiUsage(userId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today())
    .maybeSingle();
  if (error) throw error;
  return data?.count ?? 0;
}

export async function addAiUsage(userId: string, amount: number, current: number) {
  const { error } = await createAdminClient()
    .from("ai_usage")
    .upsert({ user_id: userId, day: today(), count: current + amount }, { onConflict: "user_id,day" });
  if (error) console.error("ai usage: could not record", error);
}

export type AiAccess = {
  /** The user's own Groq key, if they saved one. */
  ownKey: string | null;
  used: number;
  /** Drafts allowed per day on the shared AI; null when the user's own key is used (no limit from Outbox). */
  limit: number | null;
  /** Drafts left today on the shared AI; null when the user's own key is used. */
  remaining: number | null;
};

/** What this user may do with AI today. Throws if the usage table is missing (callers show a setup message). */
export async function getAiAccess(userId: string): Promise<AiAccess> {
  const [ownKey, used] = await Promise.all([getUserGroqKey(userId), getAiUsage(userId)]);
  if (ownKey) return { ownKey, used, limit: null, remaining: null };
  return { ownKey: null, used, limit: AI_DAILY_LIMIT, remaining: Math.max(0, AI_DAILY_LIMIT - used) };
}
