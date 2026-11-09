type AuthErrorLike = {
  name?: string;
  status?: number;
} | null | undefined;

/** A temporary auth service failure must never be treated as a revoked session. */
export function isTransientAuthError(error: AuthErrorLike) {
  if (!error) return false;
  const status = error.status ?? 0;
  return error.name === "AuthRetryableFetchError"
    || status === 0
    || status === 408
    || status === 425
    || status === 429
    || status >= 500;
}
