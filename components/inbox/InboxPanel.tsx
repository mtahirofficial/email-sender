"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertIcon, CheckIcon, DownloadIcon, ExternalLinkIcon, InfoIcon, MarkReadIcon, PaperclipIcon, RefreshIcon, SettingsIcon, SparkleIcon, SpinnerIcon, StarIcon, XIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";
import { useScrollLock } from "@/components/useScrollLock";
import FullInbox, { senderAddress, type MailItem } from "@/components/inbox/FullInbox";

type Status = "waiting" | "replied" | "answered" | "bounced" | "closed";
type Item = {
  id: string;
  account_id: string;
  to_email: string;
  subject: string;
  sent_at: string;
  status: Status;
  reply_from: string | null;
  reply_snippet: string | null;
  reply_at: string | null;
  follow_up_count: number;
  followUpSending: boolean;
  followUpScheduledAt?: string | null;
  ai_intent: string | null;
  ai_summary: string | null;
  followUpDue: boolean;
  /** a new reply arrived on a conversation marked done and was not opened yet */
  reply_unseen?: boolean;
};
type Account = { id: string; email: string; provider: string; inbox_enabled: boolean; sheets_enabled: boolean };
type Settings = { follow_up_after_days: number; max_follow_ups: number; instructions: string; last_sync_at: string | null };
type Data = { settings: Settings; accounts: Account[]; items: Item[] };
type Attachment = { id: string; filename: string; mimeType: string; size: number };
type Message = { id: string; from: string; fromMe: boolean; at: number; text: string; unread: boolean; starred: boolean; attachments: Attachment[] };
type Draft = { body: string; summary?: string; intent?: string; needsReply?: boolean };
type Tab = "replies" | "followup" | "waiting" | "done" | "all";
type FollowUpFilter = "all" | "scheduled" | "unscheduled";

const TABS: { key: Tab; label: string }[] = [
  { key: "replies", label: "Replies" },
  { key: "followup", label: "Follow-up due" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
  { key: "all", label: "Full inbox" },
];
const INTENT: Record<string, string> = {
  interested: "Interested",
  question: "Has a question",
  not_interested: "Not interested",
  out_of_office: "Out of office",
  unsubscribe: "Wants to stop",
  other: "Other",
};

const inTab = (item: Item, tab: Tab) =>
  tab === "all" ? false : tab === "replies" ? item.status === "replied" : tab === "followup" ? item.followUpDue : tab === "waiting" ? item.status === "waiting" && !item.followUpDue : ["answered", "bounced", "closed"].includes(item.status);

function ago(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

class ApiError extends Error {
  constructor(message: string, public data: Record<string, unknown>) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : `The request failed (${res.status}).`, data);
  return data as T;
}
const post = <T,>(url: string, body: unknown) => call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function attachmentSize(size: number) {
  if (!size) return "";
  return size < 1_000_000 ? `${Math.max(1, Math.round(size / 1000))} KB` : `${(size / 1_000_000).toFixed(1)} MB`;
}

function formattedEmailText(source: string) {
  const tokens = /\[image:\s*([^\]]+)\]\s*<(https?:\/\/[^>\s]+)>|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>]+)|\b([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})\b|\*([^*\n]+)\*|_([^_\n]+)_/gi;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokens.exec(source))) {
    if (match.index > cursor) parts.push(source.slice(cursor, match.index));
    const imageLink = match[1] !== undefined;
    const markdownLink = match[3] !== undefined;
    const angleLink = match[5] !== undefined;
    const plainLink = match[6] !== undefined;
    const email = match[7] !== undefined;
    const bold = match[8] !== undefined;
    const italic = match[9] !== undefined;

    if (imageLink || markdownLink || angleLink || plainLink || email) {
      const rawUrl = (imageLink ? match[2] : markdownLink ? match[4] : angleLink ? match[5] : plainLink ? match[6] : `mailto:${match[7]}`) ?? "";
      const label = (imageLink ? (match[1] ?? "").trim() : markdownLink ? match[3] : email ? match[7] : plainLink ? match[6] : match[5]) ?? "";
      let url = rawUrl;
      let suffix = "";
      if (plainLink) {
        const trimmed = url.replace(/[.,!?;:]+$/, "");
        suffix = url.slice(trimmed.length);
        url = trimmed;
      }
      parts.push(<a key={key++} href={url} target={email ? undefined : "_blank"} rel={email ? undefined : "noopener noreferrer"} className="font-medium text-accent-deep underline underline-offset-2">{label}</a>);
      if (suffix) parts.push(suffix);
    } else if (bold) {
      parts.push(<strong key={key++} className="font-semibold">{formattedEmailText(match[8])}</strong>);
    } else if (italic) {
      parts.push(<em key={key++}>{formattedEmailText(match[9])}</em>);
    }
    cursor = tokens.lastIndex;
  }

  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

function FormattedEmail({ text }: { text: string }) {
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="space-y-3 break-words leading-relaxed">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap">{formattedEmailText(paragraph)}</p>
      ))}
    </div>
  );
}

function ReplyInfoTip({ className = "", floating = false }: { className?: string; floating?: boolean }) {
  return (
    <span className={`group inline-flex ${floating ? "" : "relative"} ${className}`}>
      <button type="button" aria-label="About AI drafted replies" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-mist hover:text-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent">
        <InfoIcon className="h-4 w-4" />
      </button>
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full right-0 z-40 mb-2 w-64 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-paper opacity-0 shadow-lift transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        The AI only suggests. Read and change the text, then press Send. It goes out inside the same conversation.
      </span>
    </span>
  );
}

const enableHref = (a: Account) => `/oauth/google?inbox=1${a.sheets_enabled ? "&sheets=1" : ""}&next=${encodeURIComponent("/inbox")}`;

export default function InboxPanel() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("replies");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncProblems, setSyncProblems] = useState<{ email: string; error: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState<Item | null>(null); // a message opened from the full inbox
  const [fullInboxRefreshToken, setFullInboxRefreshToken] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null); // which mailbox is open
  const stopBulk = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await call<Data>("/api/inbox"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Inbox.");
    }
  }, []);

  const sync = useCallback(
    async (force: boolean) => {
      setSyncing(true);
      try {
        const result = await post<{ skipped: boolean; accounts: { email: string; newReplies: number; error?: string }[] }>("/api/inbox/sync", { force });
        setSyncProblems(result.accounts.filter((a) => a.error).map((a) => ({ email: a.email, error: a.error! })));
        const fresh = result.accounts.reduce((n, a) => n + a.newReplies, 0);
        if (fresh > 0) toast.success(`${fresh} new repl${fresh === 1 ? "y" : "ies"}.`);
        else if (force && !result.skipped) toast.info("No new replies.");
        await load();
      } catch (err) {
        if (force) toast.error(err instanceof Error ? err.message : "Could not check for replies.");
      } finally {
        setSyncing(false);
      }
    },
    [load, toast]
  );

  // Load the list, then look for new replies now and every 2 minutes while the page is open.
  const hasReader = Boolean(data?.accounts.some((a) => a.provider === "google" && a.inbox_enabled));
  useEffect(() => {
    void load();
    try {
      setAccountId(localStorage.getItem("inbox-account"));
    } catch {
      // not available: start with the first mailbox
    }
  }, [load]);
  useEffect(() => {
    if (!hasReader) return;
    void sync(false);
    const id = setInterval(() => document.visibilityState === "visible" && void sync(false), 120_000);
    return () => clearInterval(id);
  }, [hasReader, sync]);

  const hasSendingFollowUp = Boolean(data?.items.some((item) => item.followUpSending));
  useEffect(() => {
    if (!hasSendingFollowUp) return;
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 5_000);
    return () => clearInterval(id);
  }, [hasSendingFollowUp, load]);

  const accounts = data?.accounts ?? [];
  const selected = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.provider === "google" && a.inbox_enabled) ?? accounts[0] ?? null;
  const items = (data?.items ?? []).filter((i) => i.account_id === selected?.id); // this mailbox only
  const counts = Object.fromEntries(TABS.map((t) => [t.key, items.filter((i) => inTab(i, t.key)).length])) as Record<Tab, number>;
  const scheduledFollowUpCount = items.filter((item) => item.followUpDue && (item.followUpSending || Boolean(item.followUpScheduledAt))).length;
  const list = items.filter((item) => {
    if (!inTab(item, tab)) return false;
    if (tab !== "followup" || followUpFilter === "all") return true;
    const scheduled = item.followUpSending || Boolean(item.followUpScheduledAt);
    return followUpFilter === "scheduled" ? scheduled : !scheduled;
  });
  const hasNewDone = items.some((i) => i.reply_unseen);
  const stats = (accountId: string) => {
    const mine = (data?.items ?? []).filter((i) => i.account_id === accountId);
    return { replies: mine.filter((i) => i.status === "replied" || i.reply_unseen).length, due: mine.filter((i) => i.followUpDue).length };
  };

  function pick(id: string) {
    setAccountId(id);
    setOpenId(null);
    setMailOpen(null);
    try {
      localStorage.setItem("inbox-account", id);
    } catch {
      // private mode: the choice just isn't remembered
    }
  }

  async function draftAll() {
    const todo = list.filter((i) => !drafts[i.id]);
    if (todo.length === 0) return;
    stopBulk.current = false;
    setBulk({ done: 0, total: todo.length });
    let made = 0;
    for (const item of todo) {
      if (stopBulk.current) break;
      try {
        const d = await post<Draft>("/api/inbox/draft", { id: item.id, kind: "followup" });
        setDrafts((m) => ({ ...m, [item.id]: { body: d.body } }));
        made++;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not write the drafts.");
        break;
      }
      setBulk({ done: made, total: todo.length });
    }
    setBulk(null);
    if (made > 0) toast.success(`${made} follow-up draft${made === 1 ? "" : "s"} ready. Open each one to check it and press Send.`);
  }

  if (error && !data) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <SpinnerIcon className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-mist px-4 py-4 text-sm text-ink-soft">
        The Inbox works with Gmail accounts. Connect a Gmail account in Settings first.
      </p>
    );
  }

  const opened = items.find((i) => i.id === openId) ?? null;
  const problems = syncProblems.filter((p) => p.email === selected?.email);
  const canRead = Boolean(selected && selected.provider === "google" && selected.inbox_enabled);

  return (
    <div className="grid min-w-0 gap-3 md:gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Mailboxes" className="card min-w-0 h-fit p-3">
        <label htmlFor="inbox-mailbox" className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft md:hidden">Mailbox</label>
        <select
          id="inbox-mailbox"
          value={selected?.id ?? ""}
          onChange={(event) => pick(event.target.value)}
          className="input min-h-11 md:hidden"
        >
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
        <p className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft md:block">Mailboxes</p>
        <ul className="hidden gap-1 md:block md:space-y-1">
          {accounts.map((a) => {
            const active = a.id === selected?.id;
            const s = stats(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => pick(a.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${active ? "bg-accent-soft text-accent-deep" : "text-ink hover:bg-mist"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block min-w-0 truncate font-medium">{a.email}</span>
                    <span className="block text-xs opacity-70">
                      {a.provider === "microsoft" ? "Outlook inbox not supported" : a.provider === "smtp" ? "SMTP is send-only" : !a.inbox_enabled ? "Not allowed yet" : s.due > 0 ? `${s.due} need a follow-up` : "Up to date"}
                    </span>
                  </span>
                  {s.replies > 0 && (
                    <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white" title="Replies waiting for an answer">
                      {s.replies}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0 space-y-3 sm:space-y-5">
        {selected && selected.provider === "microsoft" && (
          <p className="rounded-xl border border-line bg-mist px-4 py-4 text-sm text-ink-soft">Outlook inbox access is not available yet. Choose a Gmail account to view messages and replies.</p>
        )}
        {selected && selected.provider === "smtp" && (
          <p className="rounded-xl border border-line bg-mist px-4 py-4 text-sm text-ink-soft">SMTP accounts can send email, but they don’t provide inbox access here. Choose a Gmail account to view messages and replies.</p>
        )}

        {selected && selected.provider === "google" && !selected.inbox_enabled && (
          <div className="card p-5">
            <h2 className="font-serif text-lg text-ink">Let Outbox see replies for {selected.email}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              To show your inbox and replies, Google asks you to allow Outbox to read your email. Messages are read from Gmail when you look at them and are not stored by Outbox. This is optional: sending works without it.
            </p>
            <a href={enableHref(selected)} className="btn-secondary mt-3 min-h-[40px] px-3.5 text-sm">
              Allow for {selected.email}
            </a>
          </div>
        )}

        {problems.map((p) => (
          <p key={p.email} role="alert" className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-2.5 text-sm text-amber">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{p.error}</span>
          </p>
        ))}

        {canRead && (
          <div className="card min-w-0 p-3 sm:p-5">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="tablist" aria-label="Conversations">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${tab === t.key ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-white text-ink-soft hover:bg-mist"}`}
                  >
                    {t.label}{t.key !== "all" && <span className="text-xs"> {counts[t.key]}</span>}
                    {t.key === "done" && hasNewDone && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-accent" aria-label="New reply in Done" />}
                  </button>
                ))}
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
                {tab === "followup" && counts.followup > 0 && (
                  <>
                    <label className="sr-only" htmlFor="follow-up-filter">Filter follow-ups</label>
                    <select id="follow-up-filter" value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)} className="input min-h-[40px] w-full sm:w-auto">
                      <option value="all">All due ({counts.followup})</option>
                      <option value="scheduled">Scheduled ({scheduledFollowUpCount})</option>
                      <option value="unscheduled">Not scheduled ({counts.followup - scheduledFollowUpCount})</option>
                    </select>
                    {list.length > 0 && <button type="button" onClick={draftAll} disabled={bulk !== null} className="btn-primary min-h-[40px] px-3.5 text-sm">
                      {bulk ? <SpinnerIcon /> : null} {bulk ? `Writing ${bulk.done}/${bulk.total}` : "Write all follow-ups"}
                    </button>}
                    {bulk && (
                      <button type="button" onClick={() => (stopBulk.current = true)} className="btn-ghost min-h-[40px] px-3 text-sm">
                        Stop
                      </button>
                    )}
                  </>
                )}
                {tab !== "all" && (
                  <button type="button" onClick={() => sync(true)} disabled={syncing} aria-label={syncing ? "Refreshing inbox" : "Refresh inbox"} className="icon-action">
                    {syncing ? <SpinnerIcon /> : <RefreshIcon className="h-4 w-4" />}
                  </button>
                )}
                <Link href="/settings#inbox" className="icon-action" aria-label="Inbox settings">
                  <SettingsIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {tab === "all" && selected && (
              <div className="mt-4">
                <FullInbox
                  accountId={selected.id}
                  refreshToken={fullInboxRefreshToken}
                  onOpen={(m: MailItem) =>
                    setMailOpen({
                      id: `mail:${selected.id}:${m.threadId}`, // not an Outbox conversation: the id carries the account and the Gmail thread
                      account_id: selected.id,
                      to_email: senderAddress(m.from),
                      subject: m.subject || "(no subject)",
                      sent_at: new Date(m.at).toISOString(),
                      status: "replied",
                      reply_from: m.from,
                      reply_snippet: m.snippet,
                      reply_at: new Date(m.at).toISOString(),
                      follow_up_count: 0,
                      followUpSending: false,
                      followUpScheduledAt: null,
                      ai_intent: null,
                      ai_summary: null,
                      followUpDue: false,
                    })
                  }
                />
              </div>
            )}

            <ul className={`mt-4 min-w-0 divide-y divide-line  overscroll-contain pr-1 ${tab === "all" ? "hidden" : ""}`}>
              {/* <ul className={`mt-4 min-w-0 max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain pr-1 ${tab === "all" ? "hidden" : ""}`}> */}
              {list.length === 0 && (
                <li className="px-2 py-8 text-center text-sm text-ink-soft">
                  {tab === "replies" ? "No replies waiting for an answer." : tab === "followup" ? followUpFilter === "scheduled" ? "No follow-ups are scheduled." : followUpFilter === "unscheduled" ? "No due follow-ups are waiting to be scheduled." : "Nothing needs a follow-up yet." : tab === "waiting" ? "No emails are waiting for a reply." : "Nothing here yet."}
                </li>
              )}
              {list.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className={`block w-full rounded-lg px-2 py-3 text-left ${item.reply_unseen ? "border border-accent bg-accent-soft/60 hover:bg-accent-soft" : "hover:bg-mist"}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 break-all text-sm font-semibold text-ink">{item.to_email}</span>
                      {item.ai_intent && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">{INTENT[item.ai_intent] ?? item.ai_intent}</span>}
                      {item.reply_unseen && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">New reply</span>}
                      {item.followUpSending && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"><SpinnerIcon className="h-3 w-3" />Sending follow-up</span>}
                      {item.followUpScheduledAt && !item.followUpSending && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-deep">Automatic follow-up scheduled</span>}
                      {drafts[item.id] && <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-medium text-ink">Draft ready</span>}
                      <span className="ml-auto text-xs text-ink-soft">{item.status === "replied" || item.reply_unseen ? `Replied ${ago(item.reply_at)}` : `Sent ${ago(item.sent_at)}`}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-soft">{(item.status === "replied" || item.reply_unseen) && item.reply_snippet ? item.reply_snippet : item.subject}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {item.status === "waiting" && `${item.follow_up_count} of ${data.settings.max_follow_ups} follow-ups sent`}
                      {item.status === "bounced" && "The email bounced"}
                      {item.status === "answered" && "You answered"}
                      {item.status === "closed" && "Marked done"}
                      {item.status === "replied" && item.subject}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {mailOpen && (
        <Conversation key={mailOpen.id} item={mailOpen} onDraft={() => { }} onClose={() => setMailOpen(null)} onChanged={async () => { setFullInboxRefreshToken((token) => token + 1); }} next={() => setMailOpen(null)} />
      )}

      {opened && (
        <Conversation
          key={opened.id}
          item={opened}
          draft={drafts[opened.id]}
          onDraft={(d) => setDrafts((m) => ({ ...m, [opened.id]: d }))}
          onClose={() => setOpenId(null)}
          onChanged={async (sent) => {
            if (sent) setDrafts((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== opened.id)));
            await load();
          }}
          next={() => {
            const rest = list.filter((i) => i.id !== opened.id && drafts[i.id]);
            setOpenId(rest[0]?.id ?? null);
          }}
        />
      )}
    </div>
  );
}

/** A message box that is one line high, grows as the text grows and stops at 4 lines (then it scrolls). */
function AutoTextarea({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  maxLines = 4,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  maxLength?: number;
  maxLines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 24;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const max = line * maxLines + padding;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxLines]);
  return <textarea ref={ref} id={id} rows={1} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength} className={`input resize-none ${className}`} />;
}

function Conversation({
  item,
  draft,
  onDraft,
  onClose,
  onChanged,
  next,
}: {
  item: Item;
  draft?: Draft;
  onDraft: (d: Draft) => void;
  onClose: () => void;
  onChanged: (sent: boolean) => Promise<void>;
  next: () => void;
}) {
  const toast = useToast();
  useScrollLock(); // the page behind the conversation does not scroll while it is open
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [text, setText] = useState(draft?.body ?? "");
  const [info, setInfo] = useState<{ summary?: string; intent?: string } | null>(item.ai_summary ? { summary: item.ai_summary, intent: item.ai_intent ?? undefined } : null);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "status" | "mail-action">("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [showDraftInfo, setShowDraftInfo] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);
  const downloadResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A message opened from the full inbox is not an Outbox conversation: it is found by account + Gmail thread.
  const synthetic = item.id.startsWith("mail:");
  const target: Record<string, string> = synthetic ? { account: item.account_id, thread: item.id.split(":")[2] } : { id: item.id };
  const kind: "reply" | "followup" | null = item.status === "waiting" ? "followup" : item.status === "replied" || item.status === "answered" || (item.status === "closed" && Boolean(item.reply_at)) ? "reply" : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (promptOpen) setPromptOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, promptOpen]);

  useEffect(() => () => {
    if (downloadResetRef.current) clearTimeout(downloadResetRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    call<{ messages: Message[]; threadId: string }>(`/api/inbox/thread?${new URLSearchParams(target)}`)
      .then((d) => { if (!cancelled) { setMessages(d.messages); setThreadId(d.threadId); } })
      .catch((err) => !cancelled && setProblem(err instanceof Error ? err.message : "Could not open this conversation."));
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function updateMail(action: "mark-read" | "star" | "unstar", messageId?: string) {
    if (!threadId) return;
    setBusy("mail-action");
    try {
      await post("/api/inbox/mail/action", { account: item.account_id, threadId, ...(messageId ? { messageId } : {}), action });
      if (action === "mark-read") setMessages((current) => current?.map((m) => ({ ...m, unread: false })) ?? null);
      else if (messageId) setMessages((current) => current?.map((m) => m.id === messageId ? { ...m, starred: action === "star" } : m) ?? null);
      await onChanged(false);
    } catch (err) {
      if (err instanceof ApiError && err.data.needsPermission === true) setNeedsPermission(true);
      toast.error(err instanceof Error ? err.message : "Could not update this message.");
    } finally {
      setBusy("");
    }
  }

  // instruction empty: the AI reads the reply and suggests an answer. Otherwise it writes what the person's own prompt asks for.
  async function writeDraft(instruction = "") {
    if (!kind) return;
    setBusy("draft");
    try {
      const d = await post<Draft>("/api/inbox/draft", { ...target, kind, ...(instruction ? { instruction } : {}) });
      if (!instruction) setInfo(d.summary || d.intent ? { summary: d.summary, intent: d.intent } : null);
      if (d.needsReply === false) {
        setText("");
        setShowDraftInfo(false);
        toast.info("This message does not need an answer. You can mark it done.");
      } else {
        setText(d.body);
        setShowDraftInfo(!instruction.trim());
        onDraft({ body: d.body });
      }
      setPromptOpen(false); // the prompt box goes away and the message box shows the result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not write the draft.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!kind || !text.trim()) return;
    setBusy("send");
    try {
      const r = await post<{ sentTo: string }>("/api/inbox/send", { ...target, kind, body: text });
      if (kind === "reply") setMessages((current) => current?.map((message) => ({ ...message, unread: false })) ?? null);
      toast.success(`Sent to ${r.sentTo}.`);
      await onChanged(true);
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
      setBusy("");
    }
  }

  async function setStatus(action: "close" | "reopen") {
    setBusy("status");
    try {
      await post("/api/inbox/status", { id: item.id, action });
      toast.success(action === "close" ? "Marked done." : "Moved back to your lists.");
      await onChanged(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change this.");
      setBusy("");
    }
  }

  return (
    <div className="inbox-conversation-shell" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Conversation with ${item.to_email}`} className="relative flex h-full w-full max-w-4xl flex-col border-l border-line bg-surface text-ink shadow-lift">
        <div className="flex min-h-11 min-w-0 items-center gap-2 border-b border-line px-3 py-1.5 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <p className="max-w-[52%] shrink truncate font-semibold text-ink" title={item.to_email}>{item.to_email}</p>
            <p className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={item.subject}>{item.subject}</p>
          </div>
          {messages?.some((m) => m.unread) && <button type="button" onClick={() => void updateMail("mark-read")} disabled={busy !== ""} aria-label="Mark thread as read" className="icon-action h-8 w-8"><MarkReadIcon className="h-4 w-4" /></button>}
          <button type="button" onClick={onClose} aria-label="Close conversation" className="icon-action h-8 w-8">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
          {needsPermission && (
            <p role="alert" className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-2.5 text-sm text-amber">
              Gmail needs to grant message-management access before Outbox can mark messages read or star them. <a href="/oauth/google?inbox=1&amp;next=%2Finbox" className="font-semibold underline underline-offset-2">Reconnect Gmail</a> and allow Inbox access.
            </p>
          )}
          {problem && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {problem}
            </p>
          )}
          {!messages && !problem && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <SpinnerIcon className="h-4 w-4" /> Opening the conversation...
            </p>
          )}
          {messages?.map((m, i) => (
            <div key={i} className={`min-w-0 rounded-xl border border-transparent px-3.5 py-2.5 text-sm transition-colors hover:border-accent/40 ${m.fromMe ? "ml-3 bg-accent-soft text-accent-deep sm:ml-8" : "mr-3 bg-mist text-ink sm:mr-8"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                <p className="min-w-0 flex-1 truncate">{m.fromMe ? "You" : m.from} · {new Date(m.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
                <button type="button" onClick={() => void updateMail(m.starred ? "unstar" : "star", m.id)} disabled={busy !== ""} aria-label={`${m.starred ? "Remove star from" : "Star"} message`} className={`icon-action h-7 w-7 ${m.starred ? "text-amber-500" : ""}`}><StarIcon className="h-4 w-4" /></button>
              </div>
              <FormattedEmail text={m.text} />
              {m.attachments.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
                  <p className="text-xs font-semibold opacity-75">Attachments ({m.attachments.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {m.attachments.map((attachment) => {
                      const params = new URLSearchParams({ account: item.account_id, thread: threadId ?? item.id.split(":")[2] ?? "", message: m.id, attachment: attachment.id, filename: attachment.filename, type: attachment.mimeType, size: String(attachment.size) });
                      const attachmentUrl = `/api/inbox/attachment?${params}`;
                      return (
                        <div key={attachment.id} role="group" aria-label={`Attachment ${attachment.filename}`} tabIndex={0} className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft/60 focus-within:border-accent/50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                          <PaperclipIcon className="h-4 w-4 shrink-0 text-accent-deep" />
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink group-hover:text-accent-deep">{attachment.filename}</span><span className="text-ink-soft">{attachmentSize(attachment.size) || attachment.mimeType}</span></span>
                          <span className="flex shrink-0 items-center gap-1 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex">
                            <a href={`${attachmentUrl}&open=1`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${attachment.filename} in a new tab`} className="icon-action"><ExternalLinkIcon className="h-4 w-4" /></a>
                            <a
                              href={attachmentUrl}
                              download={attachment.filename}
                              aria-label={`Download ${attachment.filename}`}
                              aria-busy={downloadingAttachment === attachment.id}
                              onClick={() => {
                                setDownloadingAttachment(attachment.id);
                                if (downloadResetRef.current) clearTimeout(downloadResetRef.current);
                                downloadResetRef.current = setTimeout(() => setDownloadingAttachment(null), 2500);
                              }}
                              className="icon-action"
                            >
                              {downloadingAttachment === attachment.id ? <SpinnerIcon className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
                            </a>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {info && (info.summary || info.intent) && (
            <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What they want{info.intent ? ` · ${INTENT[info.intent] ?? info.intent}` : ""}</p>
              {info.summary && <p className="mt-1 text-ink">{info.summary}</p>}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line px-3 py-3 sm:px-5 sm:py-4">
          {kind && (
            <>
              {kind === "followup" ? <label htmlFor="draft-text" className="label">Follow-up {item.follow_up_count + 1}</label> : <label htmlFor="draft-text" className="sr-only">Your reply</label>}
              <div className="relative">
                <AutoTextarea
                  id="draft-text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    onDraft({ body: e.target.value });
                  }}
                  maxLength={5000}
                  placeholder={kind === "reply" ? "Write your reply, or let the AI suggest one." : "Write a follow-up, or let the AI suggest one."}
                  className={showDraftInfo ? "pr-12" : ""}
                />
                {showDraftInfo && <ReplyInfoTip floating className="absolute right-2 top-1" />}
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {kind && (
              <>
                <button type="button" onClick={() => writeDraft()} disabled={busy !== "" || !messages} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  {busy === "draft" && !promptOpen ? <SpinnerIcon /> : null}
                  <span className="lg:hidden">{kind === "reply" ? "Draft reply" : "Draft follow-up"}</span>
                  <span className="hidden lg:inline">{kind === "reply" ? "Understand and draft reply" : "Draft follow-up"}</span>
                </button>
                <button type="button" onClick={() => setPromptOpen((v) => !v)} aria-expanded={promptOpen} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  <SparkleIcon className="h-4 w-4" />
                  <span className="lg:hidden">My prompt</span>
                  <span className="hidden lg:inline">{text.trim() ? "Regenerate with my prompt" : "Write with my prompt"}</span>
                </button>
                <button type="button" onClick={send} disabled={busy !== "" || promptOpen || !text.trim()} className="btn-primary min-h-[40px] px-4 text-sm">
                  {busy === "send" ? <SpinnerIcon /> : <CheckIcon className="h-4 w-4" />} Send
                </button>
              </>
            )}
            {synthetic ? null : item.status === "closed" ? (
              <button type="button" onClick={() => setStatus("reopen")} disabled={busy !== ""} className="btn-ghost ml-auto min-h-[40px] px-3 text-sm">
                Reopen
              </button>
            ) : (
              <button type="button" onClick={() => setStatus("close")} disabled={busy !== ""} className="btn-ghost ml-auto min-h-[40px] px-2 text-xs sm:px-3 sm:text-sm">
                Mark done
              </button>
            )}
          </div>

        {promptOpen && kind && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setPromptOpen(false)}>
            <section role="dialog" aria-modal="true" aria-labelledby="own-prompt-title" className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 text-ink shadow-lift sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="own-prompt-title" className="font-serif text-xl">Write with your prompt</h2>
                  <p className="mt-1 text-sm text-ink-soft">Tell the AI what you want to say. It will use the conversation for context.</p>
                </div>
                <ReplyInfoTip className="mt-0.5" />
                <button type="button" onClick={() => setPromptOpen(false)} aria-label="Close prompt" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-mist hover:text-ink"><XIcon className="h-4 w-4" /></button>
              </div>
              <label htmlFor="own-prompt" className="label">Your instructions</label>
              <textarea
                id="own-prompt"
                autoFocus
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={'For example: "Say yes, the price is $50, and ask for the page URL."'}
                className="input"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setPromptOpen(false)} className="btn-secondary min-h-[40px] px-3.5 text-sm">Cancel</button>
                <button type="button" onClick={() => writeDraft(promptText.trim())} disabled={busy !== "" || !promptText.trim() || !messages} className="btn-primary min-h-[40px] px-3.5 text-sm">
                  {busy === "draft" ? <SpinnerIcon /> : <SparkleIcon className="h-4 w-4" />} Generate message
                </button>
              </div>
            </section>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
