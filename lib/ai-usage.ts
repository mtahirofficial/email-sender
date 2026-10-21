import { createAdminClient } from "@/lib/supabase/server";

/** Drafts one user may generate per UTC day. The free provider quota is shared by everyone. */
export const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 100;

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
