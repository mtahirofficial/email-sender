import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRESETS, type AiPreset } from "@/content/ai-presets";

/**
 * Presets shown in the "Write with AI" dialog. Uses the admin's edited copies
 * once they exist in the database, and the built-in defaults until then (or if
 * the table isn't there yet), so the buttons always have something to show.
 */
export async function getAiPresets(supabase: SupabaseClient): Promise<AiPreset[]> {
  const { data, error } = await supabase
    .from("ai_presets")
    .select("id, label, prompt")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: true });

  if (!error && data && data.length > 0) return data as AiPreset[];
  return DEFAULT_PRESETS.map((p) => ({ id: p.slug, label: p.label, prompt: p.prompt }));
}
