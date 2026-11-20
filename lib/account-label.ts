export type AccountProvider = "google" | "microsoft" | "smtp";

/** Human-readable sender label, with the saved SMTP host to distinguish mail servers. */
export function accountProviderLabel(provider: AccountProvider, smtpHost?: string | null) {
  if (provider === "google") return "Gmail";
  if (provider === "microsoft") return "Outlook";
  const host = smtpHost?.trim();
  return host ? `SMTP · ${host}` : "SMTP";
}
