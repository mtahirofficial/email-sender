import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { automationErrorResponse, getSettings, todayIn } from "@/lib/automation";

export const dynamic = "force-dynamic";

type QueueRow = {
  id: string;
  account_id: string;
  email: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  send_after: string;
  sent_at: string | null;
  created_at: string;
  sending_at?: string | null;
};

export type LogItem = {
  to: string;
  status: "queued" | "sending" | "sent" | "failed";
  /** when it was sent, or is planned to be sent */
  at: string;
  error?: string;
  /** only for the next email waiting in a sender: when its countdown started */
  since?: string;
};

const SENDING_WINDOW_MS = 2 * 60 * 1000; // an email picked up less than this long ago counts as "sending"
const COLUMNS = "id, account_id, email, status, error, send_after, sent_at, created_at";

/** Today's sending log, grouped by the account the emails go out from. Everything comes from the database, so a refresh keeps it. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const settings = await getSettings(supabase, user.id);
    if (!settings) return NextResponse.json({ configured: false, accounts: [], now: new Date().toISOString() });
    const day = todayIn(settings.timezone);

    const queueQuery = (cols: string) =>
      supabase.from("outreach_queue").select(cols).eq("user_id", user.id).eq("day", day).order("send_after", { ascending: true }).limit(1000);
    let queueRes = await queueQuery(`${COLUMNS}, sending_at`);
    if (queueRes.error && /sending_at/i.test(queueRes.error.message ?? "")) queueRes = await queueQuery(COLUMNS); // migration not run yet
    if (queueRes.error) throw queueRes.error;

    const [sendsRes, accountsRes] = await Promise.all([
      supabase.from("outreach_sends").select("email, account_id, sent_at").eq("user_id", user.id).eq("spreadsheet_id", settings.spreadsheet_id).eq("sent_day", day).limit(1000),
      supabase.from("connected_accounts").select("id, email").eq("user_id", user.id),
    ]);
    if (sendsRes.error) throw sendsRes.error;

    const now = Date.now();
    const accountEmail = new Map<string, string>((accountsRes.data ?? []).map((a) => [a.id as string, a.email as string]));
    const byAccount = new Map<string, LogItem[]>();
    const push = (accountId: string, item: LogItem) => {
      const list = byAccount.get(accountId) ?? [];
      list.push(item);
      byAccount.set(accountId, list);
    };

    const queued = new Set<string>();
    for (const q of (queueRes.data ?? []) as unknown as QueueRow[]) {
      queued.add(q.email.toLowerCase());
      if (q.status === "sent") push(q.account_id, { to: q.email, status: "sent", at: q.sent_at ?? q.send_after });
      else if (q.status === "failed") push(q.account_id, { to: q.email, status: "failed", at: q.sent_at ?? q.send_after, error: q.error ?? "Send failed" });
      else if (q.sending_at && now - new Date(q.sending_at).getTime() < SENDING_WINDOW_MS) push(q.account_id, { to: q.email, status: "sending", at: q.sending_at });
      else push(q.account_id, { to: q.email, status: "queued", at: q.send_after, since: q.created_at });
    }
    // Emails sent from the "Send a batch now" button are not in the queue; list them too.
    for (const s of sendsRes.data ?? []) {
      if (queued.has((s.email as string).toLowerCase()) || !s.account_id) continue;
      push(s.account_id as string, { to: s.email as string, status: "sent", at: s.sent_at as string });
    }

    const accounts = Array.from(byAccount.entries())
      .map(([id, items]) => {
        items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        // The next email waiting counts down from the last send of this account (or from when it was queued).
        const head = items.find((i) => i.status === "queued");
        if (head) {
          const lastSent = items.filter((i) => i.status === "sent").map((i) => new Date(i.at).getTime()).sort((a, b) => b - a)[0];
          if (lastSent) head.since = new Date(lastSent).toISOString();
        }
        for (const item of items) if (item !== head) delete item.since;
        const count = (status: LogItem["status"]) => items.filter((i) => i.status === status).length;
        return {
          id,
          email: accountEmail.get(id) ?? "Removed account",
          counts: { sent: count("sent"), sending: count("sending"), queued: count("queued"), failed: count("failed") },
          items,
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    const active = accounts.some((a) => a.counts.sending > 0 || a.counts.queued > 0);
    return NextResponse.json({ configured: true, day, now: new Date().toISOString(), active, accounts });
  } catch (err) {
    return automationErrorResponse(err);
  }
}
