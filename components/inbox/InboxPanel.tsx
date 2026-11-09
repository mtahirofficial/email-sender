"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AiStatusNote from "@/components/AiStatusNote";
import { AlertIcon, CheckIcon, MarkReadIcon, SparkleIcon, SpinnerIcon, StarIcon, XIcon } from "@/components/icons";
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
  ai_intent: string | null;
  ai_summary: string | null;
  followUpDue: boolean;
  /** a new reply arrived on a conversation marked done and was not opened yet */
  reply_unseen?: boolean;
};
type Account = { id: string; email: string; provider: string; inbox_enabled: boolean; sheets_enabled: boolean };
type Settings = { follow_up_after_days: number; max_follow_ups: number; instructions: string; last_sync_at: string | null };
type Data = { settings: Settings; accounts: Account[]; items: Item[] };
type Message = { id: string; from: string; fromMe: boolean; at: number; text: string; unread: boolean; starred: boolean };
type Draft = { body: string; summary?: string; intent?: string; needsReply?: boolean };
type Tab = "replies" | "followup" | "waiting" | "done" | "all";

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

const enableHref = (a: Account) => `/oauth/google?inbox=1${a.sheets_enabled ? "&sheets=1" : ""}&next=${encodeURIComponent("/inbox")}`;

export default function InboxPanel() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("replies");
  const [syncing, setSyncing] = useState(false);
  const [syncProblems, setSyncProblems] = useState<{ email: string; error: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState<Item | null>(null); // a message opened from the full inbox
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

  const accounts = data?.accounts ?? [];
  const selected = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.provider === "google" && a.inbox_enabled) ?? accounts[0] ?? null;
  const items = (data?.items ?? []).filter((i) => i.account_id === selected?.id); // this mailbox only
  const counts = Object.fromEntries(TABS.map((t) => [t.key, items.filter((i) => inTab(i, t.key)).length])) as Record<Tab, number>;
  const list = items.filter((i) => inTab(i, tab));
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
    <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Mailboxes" className="card h-fit p-3">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mailboxes</p>
        <ul className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible">
          {accounts.map((a) => {
            const active = a.id === selected?.id;
            const s = stats(a.id);
            return (
              <li key={a.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => pick(a.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${active ? "bg-accent-soft text-accent-deep" : "text-ink hover:bg-mist"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block max-w-[220px] truncate font-medium md:max-w-none">{a.email}</span>
                    <span className="block text-xs opacity-70">
                      {a.provider !== "google" ? "Outlook: not supported yet" : !a.inbox_enabled ? "Not allowed yet" : s.due > 0 ? `${s.due} need a follow-up` : "Up to date"}
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

      <div className="min-w-0 space-y-5">
        {selected && selected.provider !== "google" && (
          <p className="rounded-xl border border-line bg-mist px-4 py-4 text-sm text-ink-soft">Replies for Outlook accounts are not supported yet. Use a Gmail account here.</p>
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
          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Conversations">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tab === t.key ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-white text-ink-soft hover:bg-mist"}`}
                  >
                    {t.label}{t.key !== "all" && <span className="text-xs"> {counts[t.key]}</span>}
                    {t.key === "done" && hasNewDone && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-accent" aria-label="New reply in Done" />}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {tab === "followup" && counts.followup > 0 && (
                  <>
                    <button type="button" onClick={draftAll} disabled={bulk !== null} className="btn-primary min-h-[40px] px-3.5 text-sm">
                      {bulk ? <SpinnerIcon /> : null} {bulk ? `Writing ${bulk.done}/${bulk.total}` : "Write all follow-ups"}
                    </button>
                    {bulk && (
                      <button type="button" onClick={() => (stopBulk.current = true)} className="btn-ghost min-h-[40px] px-3 text-sm">
                        Stop
                      </button>
                    )}
                  </>
                )}
                {tab !== "all" && (
                  <button type="button" onClick={() => sync(true)} disabled={syncing} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                    {syncing ? <SpinnerIcon /> : null} Refresh
                  </button>
                )}
                <Link href="/settings#inbox" className="btn-ghost min-h-[40px] px-3 text-sm" title="Follow-up rules and notes for the AI">
                  Inbox settings
                </Link>
              </div>
            </div>

            {tab === "all" && selected && (
              <div className="mt-4">
                <FullInbox
                  accountId={selected.id}
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
                      ai_intent: null,
                      ai_summary: null,
                      followUpDue: false,
                    })
                  }
                />
              </div>
            )}

            <ul className={`mt-4 max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain pr-1 ${tab === "all" ? "hidden" : ""}`}>
              {list.length === 0 && (
                <li className="px-2 py-8 text-center text-sm text-ink-soft">
                  {tab === "replies" ? "No replies waiting for an answer." : tab === "followup" ? "Nothing needs a follow-up yet." : tab === "waiting" ? "No emails are waiting for a reply." : "Nothing here yet."}
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
            <div className="mt-3">
              <AiStatusNote />
            </div>
          </div>
        )}
      </div>

      {mailOpen && (
        <Conversation key={mailOpen.id} item={mailOpen} onDraft={() => {}} onClose={() => setMailOpen(null)} onChanged={async () => {}} next={() => setMailOpen(null)} />
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
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  maxLength?: number;
  maxLines?: number;
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
  return <textarea ref={ref} id={id} rows={1} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength} className="input resize-none" />;
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
  const [text, setText] = useState(draft?.body ?? "");
  const [info, setInfo] = useState<{ summary?: string; intent?: string } | null>(item.ai_summary ? { summary: item.ai_summary, intent: item.ai_intent ?? undefined } : null);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "status" | "mail-action">("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  // A message opened from the full inbox is not an Outbox conversation: it is found by account + Gmail thread.
  const synthetic = item.id.startsWith("mail:");
  const target: Record<string, string> = synthetic ? { account: item.account_id, thread: item.id.split(":")[2] } : { id: item.id };
  const kind: "reply" | "followup" | null = item.status === "waiting" ? "followup" : item.status === "replied" || item.status === "answered" || (item.status === "closed" && Boolean(item.reply_at)) ? "reply" : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // opening a conversation with a new reply clears its highlight
    if (!item.reply_unseen) return;
    post("/api/inbox/status", { id: item.id, action: "seen" })
      .then(() => onChanged(false))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

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
        toast.info("This message does not need an answer. You can mark it done.");
      } else {
        setText(d.body);
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
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Conversation with ${item.to_email}`} className="flex h-full w-full max-w-2xl flex-col bg-white shadow-lift">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="break-all font-semibold text-ink">{item.to_email}</p>
            <p className="truncate text-sm text-ink-soft">{item.subject}</p>
          </div>
          {messages?.some((m) => m.unread) && <button type="button" onClick={() => void updateMail("mark-read")} disabled={busy !== ""} title="Mark thread as read" className="btn-ghost min-h-[40px] px-3 text-sm"><MarkReadIcon className="h-4 w-4" /> Mark read</button>}
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-mist">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
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
            <div key={i} className={`rounded-xl px-3.5 py-2.5 text-sm ${m.fromMe ? "ml-8 bg-accent-soft text-accent-deep" : "mr-8 bg-mist text-ink"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                <p className="min-w-0 flex-1 truncate">{m.fromMe ? "You" : m.from} · {new Date(m.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
                <button type="button" onClick={() => void updateMail(m.starred ? "unstar" : "star", m.id)} disabled={busy !== ""} title={m.starred ? "Remove star" : "Star message"} aria-label={`${m.starred ? "Remove star from" : "Star"} message`} className={`rounded p-1 ${m.starred ? "text-amber-500" : "hover:text-amber-500"}`}><StarIcon className="h-4 w-4" /></button>
              </div>
              <FormattedEmail text={m.text} />
            </div>
          ))}
          {info && (info.summary || info.intent) && (
            <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What they want{info.intent ? ` · ${INTENT[info.intent] ?? info.intent}` : ""}</p>
              {info.summary && <p className="mt-1 text-ink">{info.summary}</p>}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {kind && !promptOpen && (
            <>
              <label htmlFor="draft-text" className="label">
                {kind === "reply" ? "Your reply" : `Follow-up ${item.follow_up_count + 1}`}
              </label>
              <AutoTextarea
                id="draft-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onDraft({ body: e.target.value });
                }}
                maxLength={5000}
                placeholder={kind === "reply" ? "Write your reply, or let the AI suggest one." : "Write a follow-up, or let the AI suggest one."}
              />
              <p className="text-xs text-ink-soft">The AI only suggests. Read and change the text, then press Send. It goes out inside the same conversation.</p>
            </>
          )}
          {kind && promptOpen && (
            <div className="rounded-xl border border-line bg-mist p-3">
              <label htmlFor="own-prompt" className="label">
                Your prompt
              </label>
              <textarea
                id="own-prompt"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={'Tell the AI what to say, for example: "Say yes, the price is $50, and ask for the page URL."'}
                className="input"
              />
              <button
                type="button"
                onClick={() => writeDraft(promptText.trim())}
                disabled={busy !== "" || !promptText.trim() || !messages}
                className="btn-primary mt-2 min-h-[40px] px-3.5 text-sm"
              >
                {busy === "draft" && promptOpen ? <SpinnerIcon /> : <SparkleIcon className="h-4 w-4" />} Generate message
              </button>
              <p className="mt-2 text-xs text-ink-soft">The AI also reads the conversation, so you only need to say what you want to answer.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {kind && (
              <>
                <button type="button" onClick={() => writeDraft()} disabled={busy !== "" || !messages} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  {busy === "draft" && !promptOpen ? <SpinnerIcon /> : null} {kind === "reply" ? "Understand and draft reply" : "Draft follow-up"}
                </button>
                <button type="button" onClick={() => setPromptOpen((v) => !v)} aria-expanded={promptOpen} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  <SparkleIcon className="h-4 w-4" /> {promptOpen ? "Back to the message" : text.trim() ? "Regenerate with my prompt" : "Write with my prompt"}
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
              <button type="button" onClick={() => setStatus("close")} disabled={busy !== ""} className="btn-ghost ml-auto min-h-[40px] px-3 text-sm">
                Mark done
              </button>
            )}
          </div>
          <AiStatusNote />
        </div>
      </div>
    </div>
  );
}
