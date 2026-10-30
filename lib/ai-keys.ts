import { createAdminClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

// A user's own Groq API key. Stored encrypted in public.user_ai_keys, which only the
// server (service role) can read - the key never reaches the browser.

/** Groq keys look like gsk_ followed by letters and digits. */
export function looksLikeGroqKey(key: string) {
  return /^gsk_[A-Za-z0-9_-]{20,}$/.test(key);
}

/** The user's own Groq key, or null if they have none. Never throws, so AI keeps working with the shared key. */
export async function getUserGroqKey(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().from("user_ai_keys").select("api_key").eq("user_id", userId).maybeSingle();
    if (error || !data?.api_key) return null; // no key, or the migration has not been run yet
    return decryptToken(data.api_key as string);
  } catch (err) {
    console.error("ai keys: could not read the saved key", err);
    return null;
  }
}

/** Which key is saved, without exposing it. */
export async function getUserKeyHint(userId: string): Promise<{ hasKey: boolean; hint: string | null }> {
  try {
    const { data, error } = await createAdminClient().from("user_ai_keys").select("key_hint").eq("user_id", userId).maybeSingle();
    if (error || !data) return { hasKey: false, hint: null };
    return { hasKey: true, hint: (data.key_hint as string | null) ?? null };
  } catch {
    return { hasKey: false, hint: null };
  }
}

export async function saveUserGroqKey(userId: string, key: string) {
  const { error } = await createAdminClient()
    .from("user_ai_keys")
    .upsert({ user_id: userId, provider: "groq", api_key: encryptToken(key), key_hint: key.slice(-4) }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function deleteUserGroqKey(userId: string) {
  const { error } = await createAdminClient().from("user_ai_keys").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Asks Groq to list models with this key (costs no tokens). */
export async function verifyGroqKey(key: string): Promise<"ok" | "invalid" | "unreachable"> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}
