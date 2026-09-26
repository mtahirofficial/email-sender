import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/lib/token-crypto";
import { refreshGoogleAccessToken } from "@/lib/google";
import { refreshMicrosoftAccessToken } from "@/lib/microsoft";

export type Provider = "google" | "microsoft";

export type ConnectedAccount = {
  id: string;
  provider: Provider;
  email: string;
};

/** Inserts or updates a connected sender account after a successful OAuth flow. */
export async function saveConnectedAccount(
  supabase: SupabaseClient,
  params: {
    userId: string;
    provider: Provider;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  }
) {
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();

  const { error } = await supabase.from("connected_accounts").upsert(
    {
      user_id: params.userId,
      provider: params.provider,
      email: params.email,
      access_token: encryptToken(params.accessToken),
      refresh_token: encryptToken(params.refreshToken),
      expires_at: expiresAt,
    },
    { onConflict: "user_id,provider,email" }
  );

  if (error) throw error;
}

/** Lists a user's connected sender accounts (no tokens included). */
export async function listConnectedAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectedAccount[]> {
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, email")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as ConnectedAccount[];
}

export async function deleteConnectedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
) {
  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("id", accountId);
  if (error) throw error;
}

/**
 * Returns a valid (non-expired) access token for a connected account,
 * transparently refreshing and persisting it if it's expired or about to expire.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<{ provider: Provider; email: string; accessToken: string }> {
  const { data: account, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("id", accountId)
    .single();

  if (error || !account) {
    throw new Error("Connected account not found");
  }

  const expiresAt = new Date(account.expires_at).getTime();
  const isExpiring = Date.now() > expiresAt - 60_000; // refresh 60s early

  if (!isExpiring) {
    return {
      provider: account.provider,
      email: account.email,
      accessToken: decryptToken(account.access_token),
    };
  }

  const refreshToken = decryptToken(account.refresh_token);

  if (account.provider === "google") {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    await supabase
      .from("connected_accounts")
      .update({
        access_token: encryptToken(refreshed.access_token),
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("id", account.id);
    return { provider: "google", email: account.email, accessToken: refreshed.access_token };
  }

  const refreshed = await refreshMicrosoftAccessToken(refreshToken);
  await supabase
    .from("connected_accounts")
    .update({
      access_token: encryptToken(refreshed.access_token),
      // Microsoft sometimes rotates the refresh token — keep the newest one.
      refresh_token: refreshed.refresh_token
        ? encryptToken(refreshed.refresh_token)
        : account.refresh_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq("id", account.id);

  return { provider: "microsoft", email: account.email, accessToken: refreshed.access_token };
}
