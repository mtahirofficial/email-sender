import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailLog = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  status: "sent" | "failed";
  error: string | null;
  sent_at: string;
};

export async function logEmailAttempt(
  supabase: SupabaseClient,
  params: {
    userId: string;
    accountId: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    status: "sent" | "failed";
    error?: string;
  }
) {
  // Logging failures should never break the request/response flow, so
  // errors here are swallowed after being reported to the server console.
  const { error } = await supabase.from("email_logs").insert({
    user_id: params.userId,
    account_id: params.accountId,
    from_email: params.fromEmail,
    to_email: params.toEmail,
    subject: params.subject,
    status: params.status,
    error: params.error ?? null,
  });
  if (error) console.error("Failed to write email log:", error);
}

export async function listEmailLogs(
  supabase: SupabaseClient,
  userId: string,
  limit = 25
): Promise<EmailLog[]> {
  const { data, error } = await supabase
    .from("email_logs")
    .select("id, from_email, to_email, subject, status, error, sent_at")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as EmailLog[];
}
