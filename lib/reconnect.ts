/**
 * Where "Reconnect" should send someone. A Gmail account that also has Google
 * Sheets access must keep asking for it, or automation would silently stop.
 */
export function reconnectHref(
  account: { provider: string; sheets_enabled?: boolean },
  next = "/compose"
) {
  if (account.provider !== "google") return "/oauth/microsoft";
  const params = new URLSearchParams();
  if (account.sheets_enabled) params.set("sheets", "1");
  params.set("next", next);
  return `/oauth/google?${params.toString()}`;
}
