/**
 * True when the request carries a real Supabase session cookie.
 *
 * Matches `sb-<ref>-auth-token` and its chunks (`.0`, `.1`, ...), but NOT
 * helper cookies such as `sb-<ref>-auth-token-code-verifier`, which linger
 * after sign-up and must not count as "signed in". Pure and edge-safe.
 */
export function hasSupabaseSession(cookies: { name: string }[]) {
  return cookies.some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
}

/** Browser-side variant: pass `document.cookie`. */
export function hasSessionCookieString(cookie: string) {
  return /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/.test(cookie);
}
