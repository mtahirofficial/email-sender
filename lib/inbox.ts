import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountAuthError, accountErrorInfo, getValidAccessToken, listConnectedAccounts, markNeedsReconnect } from "@/lib/accounts";
import { aiErrorMessage } from "@/lib/ai";
import { addAiUsage, getAiAccess } from "@/lib/ai-usage";
import { logEmailAttempt } from "@/lib/email-logs";
import { GoogleReadScopeError, GoogleScopeError, sendGmail } from "@/lib/google";
import {
  addressOf,
  analyzeThread,
  findOutreachThread,
  getThreadFull,
  getThreadMeta,
  listRecentInboundThreadIds,
  type ThreadMessage,
} from "@/lib/gmail-read";
import { draftFollowUp, draftReply } from "@/lib/inbox-ai";

export class InboxError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export type Conversation = {
  id: string;
  account_id: string;
  to_email: string;
  subject: string;
  sent_at: string;
  thread_id: string | null;
  status: "waiting" | "replied" | "answered" | "bounced" | "closed";
  reply_from: string | null;
  reply_snippet: string | null;
  reply_at: string | null;
  follow_up_count: number;
  last_follow_up_at: string | null;
  ai_intent: string | null;
  ai_summary: string | null;
  last_checked_at: string | null;
};

export type InboxSettings = { follow_up_after_days: number; max_follow_ups: number; instructions: string; last_sync_at: string | null };
const DEFAULTS: InboxSettings = { follow_up_after_days: 4, max_follow_ups: 2, instructions: "", last_sync_at: null };

const DAY = 86_400_000;
const WINDOW_DAYS = 45; // conversations older than this are not tracked

// ---- settings --------------------------------------------------------------

export async function getInboxSettings(supabase: SupabaseClient, userId: string): Promise<InboxSettings> {
  const { data } = await supabase.from("inbox_settings").select("follow_up_after_days, max_follow_ups, instructions, last_sync_at").eq("user_id", userId).maybeSingle();
  return { ...DEFAULTS, ...(data ?? {}) } as InboxSettings;
}

export async function saveInboxSettings(supabase: SupabaseClient, userId: string, input: Partial<InboxSettings>) {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback);
  const { error } = await supabase.from("inbox_settings").upsert(
    {
      user_id: userId,
      follow_up_after_days: clamp(input.follow_up_after_days, 1, 30, DEFAULTS.follow_up_after_days),
      max_follow_ups: clamp(input.max_follow_ups, 0, 5, DEFAULTS.max_follow_ups),
      instructions: typeof input.instructions === "string" ? input.instructions.slice(0, 2000) : "",
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

// ---- listing ---------------------------------------------------------------

export async function listInbox(supabase: SupabaseClient, userId: string) {
  const settings = await getInboxSettings(supabase, userId);
  const accounts = (await listConnectedAccounts(supabase, userId)).map((a) => ({
    id: a.id,
    email: a.email,
    provider: a.provider,
    inbox_enabled: Boolean(a.inbox_enabled),
    sheets_enabled: Boolean(a.sheets_enabled),
  }));
  const { data, error } = await supabase
    .from("conversations")
    .select("id, account_id, to_email, subject, sent_at, status, reply_from, reply_snippet, reply_at, follow_up_count, last_follow_up_at, ai_intent, ai_summary")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const now = Date.now();
  const items = (data ?? []).map((c) => ({
    ...c,
    followUpDue:
      c.status === "waiting" &&
      c.follow_up_count < settings.max_follow_ups &&
      now - Date.parse((c.last_follow_up_at as string | null) ?? (c.sent_at as string)) >= settings.follow_up_after_days * DAY,
  }));
  return { settings, accounts, items };
}

// ---- syncing with Gmail ----------------------------------------------------

async function mapLimit<T>(list: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) await fn(list[next++]);
    })
  );
}

type SyncAccount = { email: string; newReplies: number; error?: string; needsPermission?: boolean };

async function syncAccount(supabase: SupabaseClient, userId: string, account: { id: string; email: string }, ownEmails: Set<string>): Promise<SyncAccount> {
  try {
    const { accessToken: token } = await getValidAccessToken(supabase, userId, account.id);
    const since = new Date(Date.now() - WINDOW_DAYS * DAY).toISOString();

    // 1) every person this account emailed lately gets one conversation (the first email to them)
    const { data: logs } = await supabase
      .from("email_logs")
      .select("to_email, subject, sent_at")
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .eq("status", "sent")
      .gte("sent_at", since)
      .order("sent_at", { ascending: true })
      .limit(2000);
    const first = new Map<string, { subject: string; sent_at: string }>();
    for (const l of logs ?? []) {
      const to = String(l.to_email).trim().toLowerCase();
      if (!to || ownEmails.has(to) || first.has(to)) continue;
      first.set(to, { subject: l.subject as string, sent_at: l.sent_at as string });
    }
    const seeds = Array.from(first, ([to, v]) => ({ user_id: userId, account_id: account.id, to_email: to, subject: v.subject, sent_at: v.sent_at }));
    for (let i = 0; i < seeds.length; i += 500) {
      await supabase.from("conversations").upsert(seeds.slice(i, i + 500), { onConflict: "user_id,account_id,to_email", ignoreDuplicates: true });
    }

    // 2) find the Gmail conversation of each one that does not have it yet (a few per run)
    const { data: rows, error } = await supabase.from("conversations").select("*").eq("user_id", userId).eq("account_id", account.id).neq("status", "closed").gte("sent_at", since).limit(1000);
    if (error) throw error;
    const active = (rows ?? []) as Conversation[];
    const now = new Date().toISOString();
    await mapLimit(active.filter((c) => !c.thread_id).slice(0, 40), 4, async (c) => {
      const id = await findOutreachThread(token, c.to_email, Date.parse(c.sent_at));
      c.thread_id = id;
      await supabase.from("conversations").update({ ...(id ? { thread_id: id } : {}), last_checked_at: now }).eq("id", c.id);
    });

    // 3) only the conversations that received mail lately need a closer look
    const inbound = await listRecentInboundThreadIds(token, 30);
    const toCheck = active
      .filter((c) => c.thread_id && inbound.has(c.thread_id))
      .sort((a, b) => (a.last_checked_at ?? "").localeCompare(b.last_checked_at ?? ""))
      .slice(0, 60);

    let newReplies = 0;
    await mapLimit(toCheck, 4, async (c) => {
      const t = analyzeThread(await getThreadMeta(token, c.thread_id!), account.email);
      const patch: Record<string, unknown> = { last_checked_at: now, status: t.state };
      if (t.lastInbound) {
        const at = new Date(t.lastInbound.at).toISOString();
        patch.reply_from = t.lastInbound.from.slice(0, 200);
        patch.reply_snippet = t.lastInbound.snippet.slice(0, 300);
        patch.reply_at = at;
        if (c.reply_at !== at) {
          patch.ai_intent = null; // a newer reply: the old summary no longer applies
          patch.ai_summary = null;
        }
      }
      if (t.state === "waiting") patch.follow_up_count = Math.max(c.follow_up_count, t.followUps);
      if (t.state === "replied" && c.status !== "replied") newReplies++;
      await supabase.from("conversations").update(patch).eq("id", c.id);
    });
    return { email: account.email, newReplies };
  } catch (err) {
    if (err instanceof GoogleReadScopeError) {
      await supabase.from("connected_accounts").update({ inbox_enabled: false }).eq("id", account.id);
      return { email: account.email, newReplies: 0, needsPermission: true, error: "Outbox is no longer allowed to read this mailbox. Allow it again to see replies." };
    }
    if (err instanceof AccountAuthError) return { email: account.email, newReplies: 0, error: accountErrorInfo(err).message };
    console.error("inbox: sync failed", err);
    return { email: account.email, newReplies: 0, error: "Could not read this mailbox right now. Please try again in a minute." };
  }
}

export async function syncInbox(supabase: SupabaseClient, userId: string, force = false) {
  const settings = await getInboxSettings(supabase, userId);
  if (!force && settings.last_sync_at && Date.now() - Date.parse(settings.last_sync_at) < 60_000) return { skipped: true, accounts: [] as SyncAccount[] };
  await supabase.from("inbox_settings").upsert({ user_id: userId, last_sync_at: new Date().toISOString() }, { onConflict: "user_id" });

  const all = await listConnectedAccounts(supabase, userId);
  const ownEmails = new Set(all.map((a) => a.email.toLowerCase()));
  const accounts: SyncAccount[] = [];
  for (const account of all.filter((a) => a.provider === "google" && a.inbox_enabled)) accounts.push(await syncAccount(supabase, userId, account, ownEmails));
  return { skipped: false, accounts };
}

// ---- one conversation ------------------------------------------------------

async function loadConversation(supabase: SupabaseClient, userId: string, id: string): Promise<Conversation> {
  const { data } = await supabase.from("conversations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new InboxError("This conversation was not found.", 404);
  return data as Conversation;
}

async function connect(supabase: SupabaseClient, userId: string, conv: Conversation) {
  if (!conv.thread_id) throw new InboxError("This conversation is not in Gmail yet. Press Refresh and try again.", 409);
  return getValidAccessToken(supabase, userId, conv.account_id);
}

const isMine = (m: ThreadMessage, email: string) => m.labelIds.includes("SENT") || addressOf(m.from) === email.toLowerCase();

/** The conversation as readable messages. Read from Gmail now, not stored. */
export async function openThread(supabase: SupabaseClient, userId: string, id: string) {
  const conv = await loadConversation(supabase, userId, id);
  const ctx = await connect(supabase, userId, conv);
  const messages = await getThreadFull(ctx.accessToken, conv.thread_id!);
  return {
    from: ctx.email,
    messages: messages.map((m) => ({ from: m.from, fromMe: isMine(m, ctx.email), at: m.at, text: m.text || m.snippet })),
  };
}

/** Writes a draft: a reply to what they said, or a follow-up to silence. Costs one AI draft from the daily allowance. */
export async function draftConversation(supabase: SupabaseClient, userId: string, id: string, kind: "reply" | "followup", instruction = "") {
  const access = await getAiAccess(userId);
  // Mailbox text only goes to Groq (see AiOptions.groqOnly), so Groq must be available.
  if (!access.ownKey && !process.env.GROQ_API_KEY) throw new InboxError("Replies and follow-ups need a Groq key. Add your own free Groq API key in Settings.", 503, { limitReached: true });
  if (access.limit !== null && access.used + 1 > access.limit) {
    throw new InboxError(`Daily free AI limit reached (${access.limit} drafts a day). Add your own free Groq API key in Settings to write more.`, 429, { limitReached: true });
  }

  const conv = await loadConversation(supabase, userId, id);
  const ctx = await connect(supabase, userId, conv);
  const messages = await getThreadFull(ctx.accessToken, conv.thread_id!);
  const settings = await getInboxSettings(supabase, userId);
  const opts = { groqKey: access.ownKey, groqOnly: true };

  try {
    if (kind === "reply") {
      const draft = await draftReply(messages, ctx.email, settings.instructions, opts, instruction);
      await addAiUsage(userId, 1, access.used);
      // only the "understand" button saves what the AI concluded; a message written from the person's own prompt does not
      if (!instruction.trim()) await supabase.from("conversations").update({ ai_intent: draft.intent, ai_summary: draft.summary }).eq("id", id);
      return { kind, ...draft };
    }
    const body = await draftFollowUp(messages, ctx.email, settings.instructions, conv.follow_up_count + 1, Math.max(1, settings.max_follow_ups), opts, instruction);
    await addAiUsage(userId, 1, access.used);
    return { kind, body, needsReply: true, summary: "", intent: "other" };
  } catch (err) {
    console.error("inbox: draft failed", err);
    throw new InboxError(aiErrorMessage(err, Boolean(access.ownKey)), 502);
  }
}

/** Sends the text as a reply inside the same Gmail conversation, so it threads properly for the other person. */
export async function sendConversation(supabase: SupabaseClient, userId: string, id: string, kind: "reply" | "followup", body: string) {
  const text = body.trim();
  if (!text) throw new InboxError("Write something to send first.", 400);
  if (text.length > 5000) throw new InboxError("That message is too long.", 400);

  const conv = await loadConversation(supabase, userId, id);
  const ctx = await connect(supabase, userId, conv);
  const messages = await getThreadMeta(ctx.accessToken, conv.thread_id!);
  const last = messages[messages.length - 1];
  const inbound = [...messages].reverse().find((m) => !isMine(m, ctx.email) && !/mailer-daemon|postmaster/i.test(m.from));

  const base = (messages[0]?.subject || conv.subject).replace(/^((re|fwd?):\s*)+/i, "").trim() || conv.subject;
  const subject = `Re: ${base}`;
  const replyTo = inbound ? addressOf(inbound.from) : "";
  const to = kind === "reply" && /^[^\s<>"']+@[^\s<>"']+$/.test(replyTo) && replyTo !== ctx.email.toLowerCase() ? replyTo : conv.to_email;

  try {
    await sendGmail(ctx.accessToken, {
      fromEmail: ctx.email,
      to,
      subject,
      body: text,
      threadId: conv.thread_id!,
      inReplyTo: last?.messageId,
      references: [last?.references, last?.messageId].filter(Boolean).join(" ").trim() || undefined,
    });
  } catch (err) {
    if (err instanceof GoogleScopeError) {
      await markNeedsReconnect(supabase, conv.account_id, true);
      throw new InboxError(accountErrorInfo(new AccountAuthError("scope", "google", ctx.email, err.message)).message, 409, { reconnect: "google" });
    }
    await logEmailAttempt(supabase, { userId, accountId: conv.account_id, fromEmail: ctx.email, toEmail: to, subject, status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "Send failed" });
    throw new InboxError("Gmail could not send this message. Please try again.", 502);
  }

  await logEmailAttempt(supabase, { userId, accountId: conv.account_id, fromEmail: ctx.email, toEmail: to, subject, status: "sent" });
  const patch =
    kind === "reply"
      ? { status: "answered", last_checked_at: new Date().toISOString() }
      : { follow_up_count: conv.follow_up_count + 1, last_follow_up_at: new Date().toISOString(), last_checked_at: new Date().toISOString() };
  await supabase.from("conversations").update(patch).eq("id", id);
  return { sentTo: to };
}

export async function setConversationStatus(supabase: SupabaseClient, userId: string, id: string, action: "close" | "reopen") {
  await loadConversation(supabase, userId, id);
  const patch = action === "close" ? { status: "closed" } : { status: "waiting", last_checked_at: null };
  const { error } = await supabase.from("conversations").update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}
