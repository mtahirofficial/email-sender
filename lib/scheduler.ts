import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountAuthError, getValidAccessToken, markNeedsReconnect } from "@/lib/accounts";
import { aiErrorMessage, generateEmails, isAiConfigured } from "@/lib/ai";
import { addAiUsage, getAiAccess } from "@/lib/ai-usage";
import { logEmailAttempt } from "@/lib/email-logs";
import {
  assignItems, computePending, getSettings, getSheetsAccess, highlightSentToday, listSenders, markSent, sendViaAccount, todayIn, usedTodayByAccount,
  type OutreachSettings,
} from "@/lib/automation";

// The scheduler is queue based, so it never needs a long-running process:
//   1. At the chosen time it writes every email for today and gives each one a
//      "send after" time, spaced by the pause setting for that sending account.
//   2. Each tick (cron, or the open Automation page) sends whatever is due.
// All functions take an admin client because cron has no signed-in user.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const AI_BATCH = 8;

/** Today's date and minutes-since-midnight in the given timezone. */
export function localNow(timezone: string) {
  let hhmm = "00:00";
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  } catch {
    // unknown timezone: fall back to UTC below
  }
  const [h, m] = hhmm.split(":").map(Number);

  // 0 = Sunday ... 6 = Saturday, in the user's timezone
  let weekday = new Date().getUTCDay();
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
    const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
    if (index >= 0) weekday = index;
  } catch {
    // unknown timezone: UTC weekday
  }
  return { day: todayIn(timezone), minutes: h * 60 + m, weekday };
}

/** The daily schedule skips weekends: Sunday never, Saturday unless "Also send on Saturday" is ticked. */
export function sendsOnWeekday(settings: { send_saturday?: boolean }, weekday: number) {
  if (weekday === 0) return false;
  if (weekday === 6) return Boolean(settings.send_saturday);
  return true;
}

/** Writes today's emails (AI) and queues them with paced send times. */
export async function prepareDay(admin: SupabaseClient, settings: OutreachSettings): Promise<{ queued: number; note?: string }> {
  const { accessToken } = await getSheetsAccess(admin, settings.user_id, settings.account_id);
  const { pool } = await computePending(admin, accessToken, settings);
  const senders = await listSenders(admin, settings.user_id);
  const used = await usedTodayByAccount(admin, settings);
  let plan = assignItems(pool, senders, used);
  if (plan.length === 0) return { queued: 0, note: "Nothing to send: every sender is at its limit, or no unsent addresses are left." };

  // Scheduled runs share the same daily AI allowance as everything else. A user with their own
  // Groq key has no allowance from Outbox (limit is null) and their emails are written with that key.
  const access = await getAiAccess(settings.user_id);
  if (!access.ownKey && !isAiConfigured()) throw new Error("AI drafting isn't set up.");
  const usingOwnKey = Boolean(access.ownKey);

  let note: string | undefined;
  if (access.limit !== null) {
    const allowance = access.remaining ?? 0;
    if (allowance === 0) {
      throw new Error(`Daily free AI limit reached (${access.limit} drafts a day). Add your own Groq API key in Settings to write more, or wait until tomorrow.`);
    }
    if (allowance < plan.length) {
      note = `Free AI limit: only ${allowance} of ${plan.length} emails could be written today. Add your own Groq API key in Settings to write more.`;
      plan = plan.slice(0, allowance);
    }
  }

  // Write chunk by chunk. If the AI fails part-way, keep what is already written (so those credits
  // are not wasted) and try the rest again later: queued addresses are skipped on the next run.
  const written: { subject: string; body: string }[] = [];
  let usedNow = access.used;
  let failure: unknown = null;
  for (let i = 0; i < plan.length; i += AI_BATCH) {
    const chunk = plan.slice(i, i + AI_BATCH);
    try {
      const got = await generateEmails(settings.prompt, chunk.map((p) => ({ website: p.item.website, fields: p.item.fields })), { groqKey: access.ownKey });
      written.push(...got);
      await addAiUsage(settings.user_id, chunk.length, usedNow);
      usedNow += chunk.length;
    } catch (err) {
      failure = err;
      break;
    }
  }
  if (written.length === 0 && failure) throw new Error(aiErrorMessage(failure, usingOwnKey));
  plan = plan.slice(0, written.length);

  // Space each account's emails by the pause (with a little randomness, so it looks natural).
  const nextFree = new Map<string, number>();
  const day = todayIn(settings.timezone);
  const rows = plan.map((p, i) => {
    const at = nextFree.get(p.sender.accountId) ?? Date.now();
    nextFree.set(p.sender.accountId, at + settings.pause_seconds * 1000 * (0.7 + Math.random() * 0.6));
    return {
      user_id: settings.user_id,
      account_id: p.sender.accountId,
      spreadsheet_id: settings.spreadsheet_id,
      day,
      row_number: p.item.row,
      website: p.item.website,
      email: p.item.email,
      subject: written[i].subject,
      body: written[i].body,
      send_after: new Date(at).toISOString(),
    };
  });
  const { error } = await admin.from("outreach_queue").insert(rows);
  if (error) throw error;
  if (failure) {
    // Queued emails still go out; the schedule tries the missing ones again in 30 minutes.
    throw new Error(`${aiErrorMessage(failure, usingOwnKey)} ${rows.length} emails are ready and will be sent; the rest will be tried again in 30 minutes.`);
  }
  return { queued: rows.length, note };
}

/** Sends the queued emails whose time has come, within a time budget. */
export async function sendDue(admin: SupabaseClient, settings: OutreachSettings, budgetMs = 45_000) {
  const { data: due } = await admin
    .from("outreach_queue")
    .select("id, account_id, row_number, website, email, subject, body")
    .eq("user_id", settings.user_id)
    .eq("status", "pending")
    .lte("send_after", new Date().toISOString())
    .order("send_after", { ascending: true })
    .limit(30);

  const started = Date.now();
  const contexts = new Map<string, Awaited<ReturnType<typeof getValidAccessToken>> | Error>();
  const sentEmails: string[] = [];
  const day = todayIn(settings.timezone);
  let sent = 0;
  let failed = 0;

  for (const q of due ?? []) {
    if (Date.now() - started > budgetMs) break;

    // Claim the row first, so two ticks (cron and an open page) can never both send it.
    // If this process dies, the row simply becomes due again after 10 minutes.
    const claim = (fields: Record<string, unknown>) =>
      admin.from("outreach_queue").update(fields).eq("id", q.id).eq("status", "pending").lte("send_after", new Date().toISOString()).select("id");
    const bumped = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // sending_at lets the live log show "Sending..."; if that column isn't there yet, claim without it.
    const firstTry = await claim({ send_after: bumped, sending_at: new Date().toISOString() });
    const claimed = firstTry.error && /sending_at/i.test(firstTry.error.message ?? "") ? (await claim({ send_after: bumped })).data : firstTry.data;
    if (!claimed || claimed.length === 0) continue;

    let ctx = contexts.get(q.account_id);
    if (!ctx) {
      try {
        ctx = await getValidAccessToken(admin, settings.user_id, q.account_id);
      } catch (err) {
        ctx = err instanceof Error ? err : new Error("Account unavailable");
      }
      contexts.set(q.account_id, ctx);
    }
    if (ctx instanceof Error) {
      await admin.from("outreach_queue").update({ status: "failed", error: "Account needs to be reconnected", body: "" }).eq("id", q.id);
      failed++;
      continue;
    }

    try {
      await sendViaAccount(ctx, q.email, q.subject, q.body);
      await admin.from("outreach_sends").insert({
        user_id: settings.user_id, spreadsheet_id: settings.spreadsheet_id, row_number: q.row_number,
        website: q.website, email: q.email.toLowerCase(), sent_day: day, account_id: q.account_id,
      });
      await logEmailAttempt(admin, { userId: settings.user_id, accountId: q.account_id, fromEmail: ctx.email, toEmail: q.email, subject: q.subject, status: "sent" });
      await admin.from("outreach_queue").update({ status: "sent", sent_at: new Date().toISOString(), body: "" }).eq("id", q.id);
      sentEmails.push(q.email);
      sent++;
    } catch (err) {
      console.error("scheduler: send failed", err);
      // No "send email" permission: flag the account and stop trying it, instead of failing every email one by one.
      const noSendPermission = err instanceof AccountAuthError && err.reason === "scope";
      if (noSendPermission) {
        await markNeedsReconnect(admin, q.account_id, true);
        contexts.set(q.account_id, err);
      }
      await logEmailAttempt(admin, {
        userId: settings.user_id, accountId: q.account_id, fromEmail: ctx.email, toEmail: q.email, subject: q.subject,
        status: "failed", error: (err instanceof Error ? err.message : "Unknown error").slice(0, 500),
      });
      await admin.from("outreach_queue").update({ status: "failed", error: noSendPermission ? "Gmail send permission missing - reconnect the account" : "Send failed", body: "" }).eq("id", q.id);
      failed++;
    }
    await sleep(1500 + Math.random() * 2500); // never a burst
  }

  if (sentEmails.length > 0) {
    try {
      const { accessToken } = await getSheetsAccess(admin, settings.user_id, settings.account_id);
      await markSent(accessToken, settings, sentEmails);
      await highlightSentToday(accessToken, admin, settings);
    } catch (err) {
      console.error("scheduler: could not mark the sheet (it is back-filled next time)", err); // sends are recorded in the database
    }
  }
  return { sent, failed };
}

/** One tick for one user: write today's emails if it is time, then send what is due. */
export async function runTickForUser(admin: SupabaseClient, userId: string, opts: { force?: boolean } = {}) {
  const settings = await getSettings(admin, userId);
  if (!settings || !settings.schedule_enabled) return { prepared: 0, sent: 0, failed: 0, note: "Schedule is off." };

  let prepared = 0;
  let note: string | undefined;
  const { day, minutes, weekday } = localNow(settings.timezone);
  const [h, m] = settings.schedule_time.split(":").map(Number);
  const retryOk = !settings.schedule_retry_at || new Date(settings.schedule_retry_at) <= new Date();

  // "Run now" (force) is the user's own request, so only the automatic daily run skips weekends.
  const due = opts.force || (sendsOnWeekday(settings, weekday) && settings.last_scheduled_day !== day && minutes >= h * 60 + m && retryOk);

  let claimed = false;
  if (due) {
    if (opts.force) {
      claimed = true;
    } else {
      // Claim today's run first, so cron and an open page can't both write the emails.
      const { data } = await admin
        .from("outreach_settings")
        .update({ last_scheduled_day: day })
        .eq("user_id", userId)
        .or(`last_scheduled_day.is.null,last_scheduled_day.neq.${day}`)
        .select("user_id");
      claimed = (data?.length ?? 0) > 0;
    }
  }

  if (claimed) {
    try {
      const result = await prepareDay(admin, settings);
      prepared = result.queued;
      note = result.note;
      await admin.from("outreach_settings").update({ last_scheduled_day: day, schedule_retry_at: null, schedule_error: note ?? null }).eq("user_id", userId);
    } catch (err) {
      const text = (err instanceof Error ? err.message : "Could not prepare today's run").slice(0, 300);
      console.error("scheduler: prepare failed", err);
      // Give the day back and try again in 30 minutes.
      await admin
        .from("outreach_settings")
        .update({ last_scheduled_day: settings.last_scheduled_day, schedule_error: text, schedule_retry_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
        .eq("user_id", userId);
      note = text;
    }
  }

  const { sent, failed } = await sendDue(admin, settings);
  return { prepared, sent, failed, note };
}

/** One tick for everyone who has the schedule switched on (used by cron). */
export async function runTickForAll(admin: SupabaseClient) {
  const { data } = await admin.from("outreach_settings").select("user_id").eq("schedule_enabled", true);
  const started = Date.now();
  let users = 0;
  let sent = 0;
  for (const row of data ?? []) {
    if (Date.now() - started > 40_000) break;
    try {
      const result = await runTickForUser(admin, row.user_id);
      sent += result.sent;
      users++;
    } catch (err) {
      console.error("scheduler: tick failed for a user", err);
    }
  }
  return { users, sent };
}

/** Counts for today's queue, for the Automation page. */
export async function queueSummary(supabase: SupabaseClient, userId: string, timezone: string) {
  const { data } = await supabase.from("outreach_queue").select("status, send_after").eq("user_id", userId).eq("day", todayIn(timezone)).limit(1000);
  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  return {
    queued: rows.length,
    pending: pending.length,
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    nextAt: pending.map((r) => r.send_after as string).sort()[0] ?? null,
  };
}

/** When the background scheduler last called the app, or null if it never has. */
export async function getHeartbeat(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from("scheduler_heartbeat").select("last_tick_at").eq("id", 1).maybeSingle();
  return (data?.last_tick_at as string | undefined) ?? null;
}

export async function recordHeartbeat(admin: SupabaseClient) {
  await admin.from("scheduler_heartbeat").upsert({ id: 1, last_tick_at: new Date().toISOString() }); // best effort
}

/** True if the background scheduler checked in recently. */
export const isHeartbeatFresh = (iso: string | null) => Boolean(iso) && Date.now() - new Date(iso as string).getTime() < 15 * 60 * 1000;
