import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/lib/token-crypto";
import { refreshGoogleAccessToken } from "@/lib/google";
import { refreshMicrosoftAccessToken } from "@/lib/microsoft";

export type Provider = "google" | "microsoft";

export type ConnectedAccount = {
  id: string;
  provider: Provider;
  email: string;
  /** True once Google/Microsoft stopped accepting the saved connection. */
  needs_reconnect?: boolean;
  sheets_enabled?: boolean;
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
    /** Google only: whether the token also carries Google Sheets access. */
    sheetsEnabled?: boolean;
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

  // A fresh connection is healthy again (best effort: the column may not exist yet).
  await supabase
    .from("connected_accounts")
    .update({ needs_reconnect: false })
    .eq("user_id", params.userId)
    .eq("provider", params.provider)
    .eq("email", params.email);

  // Best effort, separate from the upsert so connecting still works before the
  // automation migration has been run.
  if (params.sheetsEnabled !== undefined) {
    await supabase
      .from("connected_accounts")
      .update({ sheets_enabled: params.sheetsEnabled })
      .eq("user_id", params.userId)
      .eq("provider", params.provider)
      .eq("email", params.email);
  }
}

/** Lists a user's connected sender accounts (no tokens included). */
export async function listConnectedAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectedAccount[]> {
  // Newer columns first; fall back so an older database keeps working.
  const attempts = [
    "id, provider, email, needs_reconnect, sheets_enabled",
    "id, provider, email, sheets_enabled",
    "id, provider, email",
  ];
  let lastError: unknown;
  for (const columns of attempts) {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select(columns)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (!error) return (data ?? []) as unknown as ConnectedAccount[];
    lastError = error;
  }
  throw lastError;
}

async function markNeedsReconnect(supabase: SupabaseClient, accountId: string, value: boolean) {
  await supabase.from("connected_accounts").update({ needs_reconnect: value }).eq("id", accountId); // best effort
}

/**
 * Checks each account's saved connection (a quick local check, plus a token
 * refresh only when the access token has expired) and flags the ones Google or
 * Microsoft no longer accept, so the UI can show "Reconnect" at the right time.
 */
export async function refreshAccountHealth(
  supabase: SupabaseClient,
  userId: string,
  accounts: ConnectedAccount[]
): Promise<ConnectedAccount[]> {
  return Promise.all(
    accounts.map(async (account) => {
      try {
        await getValidAccessToken(supabase, userId, account.id);
        if (account.needs_reconnect) await markNeedsReconnect(supabase, account.id, false);
        return { ...account, needs_reconnect: false };
      } catch (err) {
        const broken = err instanceof AccountAuthError && (err.reason === "revoked" || err.reason === "decrypt");
        return broken ? { ...account, needs_reconnect: true } : account; // temporary problems keep the old state
      }
    })
  );
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
export type AccountErrorReason = "revoked" | "decrypt" | "config" | "other";

/** Thrown when a connected account's saved credentials can't be turned into a working access token. */
export class AccountAuthError extends Error {
  constructor(
    public reason: AccountErrorReason,
    public provider: Provider,
    public email: string,
    detail: string
  ) {
    super(detail);
  }
}

function classifyRefreshError(err: unknown, provider: Provider, email: string) {
  const text = err instanceof Error ? err.message : String(err);
  if (/invalid_grant/i.test(text)) return new AccountAuthError("revoked", provider, email, text);
  if (/invalid_client|unauthorized_client/i.test(text)) return new AccountAuthError("config", provider, email, text);
  return new AccountAuthError("other", provider, email, text);
}

/** A message for the person using the app, and which provider to offer "Reconnect" for. */
export function accountErrorInfo(err: unknown): { message: string; reconnect?: Provider } {
  if (!(err instanceof AccountAuthError)) {
    return { message: "Could not use that connected account. Please try again." };
  }
  const who = err.provider === "google" ? "Google" : "Microsoft";
  switch (err.reason) {
    case "revoked":
      return {
        message: `${who} no longer accepts the saved connection for ${err.email}. It may have expired or access was removed. Please reconnect it.`,
        reconnect: err.provider,
      };
    case "decrypt":
      return {
        message: `The saved login details for ${err.email} can't be read, because the server's encryption key changed. Disconnect this account and connect it again.`,
        reconnect: err.provider,
      };
    case "config":
      return { message: `The server's ${who} sign-in settings look wrong. Check GOOGLE/MICROSOFT client ID and secret, and TOKEN_ENCRYPTION_KEY, in the environment variables.` };
    default:
      return { message: `Could not use ${err.email} right now. Please try again, or reconnect it.`, reconnect: err.provider };
  }
}

function decryptOrThrow(value: string, provider: Provider, email: string) {
  try {
    return decryptToken(value);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    // A missing/invalid key is a server setting; a wrong key makes AES-GCM fail to authenticate.
    throw new AccountAuthError(/TOKEN_ENCRYPTION_KEY/.test(text) ? "config" : "decrypt", provider, email, text);
  }
}

/**
 * Returns a valid (non-expired) access token for a connected account,
 * transparently refreshing and persisting it if it's expired or about to expire.
 * Throws AccountAuthError (see accountErrorInfo) when the account can't be used.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<{ provider: Provider; email: string; accessToken: string }> {
  try {
    return await resolveAccessToken(supabase, userId, accountId);
  } catch (err) {
    if (err instanceof AccountAuthError && (err.reason === "revoked" || err.reason === "decrypt")) {
      await markNeedsReconnect(supabase, accountId, true);
    }
    throw err;
  }
}

async function resolveAccessToken(
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

  const provider = account.provider as Provider;
  const email = account.email as string;
  const expiresAt = new Date(account.expires_at).getTime();
  const isExpiring = Date.now() > expiresAt - 60_000; // refresh 60s early

  if (!isExpiring) {
    return { provider, email, accessToken: decryptOrThrow(account.access_token, provider, email) };
  }

  const refreshToken = decryptOrThrow(account.refresh_token, provider, email);

  if (provider === "google") {
    let refreshed;
    try {
      refreshed = await refreshGoogleAccessToken(refreshToken);
    } catch (err) {
      throw classifyRefreshError(err, provider, email);
    }
    await supabase
      .from("connected_accounts")
      .update({
        access_token: encryptToken(refreshed.access_token),
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("id", account.id);
    return { provider: "google", email, accessToken: refreshed.access_token };
  }

  let refreshed;
  try {
    refreshed = await refreshMicrosoftAccessToken(refreshToken);
  } catch (err) {
    throw classifyRefreshError(err, provider, email);
  }
  await supabase
    .from("connected_accounts")
    .update({
      access_token: encryptToken(refreshed.access_token),
      // Microsoft sometimes rotates the refresh token — keep the newest one.
      refresh_token: refreshed.refresh_token ? encryptToken(refreshed.refresh_token) : account.refresh_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq("id", account.id);

  return { provider: "microsoft", email, accessToken: refreshed.access_token };
}
