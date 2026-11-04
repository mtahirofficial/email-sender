"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AiStatusNote from "@/components/AiStatusNote";
import { AlertIcon, CheckIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";

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
};
type Account = { id: string; email: string; provider: string; inbox_enabled: boolean; sheets_enabled: boolean };
type Settings = { follow_up_after_days: number; max_follow_ups: number; instructions: string; last_sync_at: string | null };
type Data = { settings: Settings; accounts: Account[]; items: Item[] };
type Message = { from: string; fromMe: boolean; at: number; text: string };
type Draft = { body: string; summary?: string; intent?: string; needsReply?: boolean };
type Tab = "replies" | "followup" | "waiting" | "done";

const TABS: { key: Tab; label: string }[] = [
  { key: "replies", label: "Replies" },
  { key: "followup", label: "Follow-up due" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
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
  tab === "replies" ? item.status === "replied" : tab === "followup" ? item.followUpDue : tab === "waiting" ? item.status === "waiting" && !item.followUpDue : ["answered", "bounced", "closed"].includes(item.status);

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

const enableHref = (a: Account) => `/oauth/google?inbox=1${a.sheets_enabled ? "&sheets=1" : ""}&next=${encodeURIComponent("/inbox")}`;

export default function InboxPanel() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("replies");
  const [syncing, setSyncing] = useState(false);
  const [syncProblems, setSyncProblems] = useState<{ email: string; error: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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
  }, [load]);
  useEffect(() => {
    if (!hasReader) return;
    void sync(false);
    const id = setInterval(() => document.visibilityState === "visible" && void sync(false), 120_000);
    return () => clearInterval(id);
  }, [hasReader, sync]);

  const items = data?.items ?? [];
  const counts = Object.fromEntries(TABS.map((t) => [t.key, items.filter((i) => inTab(i, t.key)).length])) as Record<Tab, number>;
  const list = items.filter((i) => inTab(i, tab));
  const googleAccounts = (data?.accounts ?? []).filter((a) => a.provider === "google");
  const accountEmail = (id: string) => data?.accounts.find((a) => a.id === id)?.email ?? "";
  const manyAccounts = (data?.accounts.length ?? 0) > 1;

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

  const opened = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="space-y-5">
      {googleAccounts.length === 0 && (
        <p className="rounded-xl border border-line bg-mist px-4 py-4 text-sm text-ink-soft">
          The Inbox works with Gmail accounts. Connect a Gmail account on the Compose page first.
          {data.accounts.length > 0 && " Replies for Outlook accounts are not supported yet."}
        </p>
      )}

      {googleAccounts.some((a) => !a.inbox_enabled) && (
        <div className="card p-5">
          <h2 className="font-serif text-lg text-ink">{hasReader ? "More Gmail accounts" : "Let Outbox see replies"}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            To show replies, Google asks you to allow Outbox to read your email. Outbox only looks for replies to emails it sent for you. The text of a message is read when you open it and is not stored. This is optional: sending works without it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {googleAccounts
              .filter((a) => !a.inbox_enabled)
              .map((a) => (
                <a key={a.id} href={enableHref(a)} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  Allow for {a.email}
                </a>
              ))}
          </div>
        </div>
      )}

      {syncProblems.map((p) => (
        <p key={p.email} role="alert" className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-2.5 text-sm text-amber">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {p.email}: {p.error}
          </span>
        </p>
      ))}

      {hasReader && (
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
                  {t.label} <span className="text-xs">{counts[t.key]}</span>
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
              <button type="button" onClick={() => sync(true)} disabled={syncing} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                {syncing ? <SpinnerIcon /> : null} Refresh
              </button>
              <button type="button" onClick={() => setShowSettings((v) => !v)} className="btn-ghost min-h-[40px] px-3 text-sm" aria-expanded={showSettings}>
                Settings
              </button>
            </div>
          </div>

          {showSettings && <SettingsForm settings={data.settings} onSaved={load} />}

          <ul className="mt-4 divide-y divide-line">
            {list.length === 0 && (
              <li className="px-2 py-8 text-center text-sm text-ink-soft">
                {tab === "replies" ? "No replies waiting for an answer." : tab === "followup" ? "Nothing needs a follow-up yet." : tab === "waiting" ? "No emails are waiting for a reply." : "Nothing here yet."}
              </li>
            )}
            {list.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpenId(item.id)} className="block w-full rounded-lg px-2 py-3 text-left hover:bg-mist">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 break-all text-sm font-semibold text-ink">{item.to_email}</span>
                    {item.ai_intent && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">{INTENT[item.ai_intent] ?? item.ai_intent}</span>}
                    {drafts[item.id] && <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-medium text-ink">Draft ready</span>}
                    <span className="ml-auto text-xs text-ink-soft">{item.status === "replied" ? `Replied ${ago(item.reply_at)}` : `Sent ${ago(item.sent_at)}`}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">{item.status === "replied" && item.reply_snippet ? item.reply_snippet : item.subject}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {manyAccounts && `From ${accountEmail(item.account_id)} · `}
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

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [days, setDays] = useState(settings.follow_up_after_days);
  const [max, setMax] = useState(settings.max_follow_ups);
  const [notes, setNotes] = useState(settings.instructions);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followUpAfterDays: days, maxFollowUps: max, instructions: notes }) });
      toast.success("Inbox settings saved.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-xl bg-mist p-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="fu-days" className="label">
            Follow up after (days)
          </label>
          <input id="fu-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-28" />
        </div>
        <div>
          <label htmlFor="fu-max" className="label">
            At most this many follow-ups
          </label>
          <input id="fu-max" type="number" min={0} max={5} value={max} onChange={(e) => setMax(Number(e.target.value))} className="input w-28" />
        </div>
      </div>
      <div>
        <label htmlFor="fu-notes" className="label">
          Notes for the AI
        </label>
        <textarea
          id="fu-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What you offer, your prices, how you like to answer. The AI uses only what is here and in the conversation, so it does not invent prices or promises."
          className="input"
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary min-h-[40px] px-4 text-sm">
        {busy ? <SpinnerIcon /> : null} Save settings
      </button>
    </form>
  );
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
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState(draft?.body ?? "");
  const [info, setInfo] = useState<{ summary?: string; intent?: string } | null>(item.ai_summary ? { summary: item.ai_summary, intent: item.ai_intent ?? undefined } : null);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "status">("");
  const kind: "reply" | "followup" | null = item.status === "waiting" ? "followup" : item.status === "replied" || item.status === "answered" ? "reply" : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    call<{ messages: Message[] }>(`/api/inbox/thread?id=${encodeURIComponent(item.id)}`)
      .then((d) => !cancelled && setMessages(d.messages))
      .catch((err) => !cancelled && setProblem(err instanceof Error ? err.message : "Could not open this conversation."));
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function writeDraft() {
    if (!kind) return;
    setBusy("draft");
    try {
      const d = await post<Draft>("/api/inbox/draft", { id: item.id, kind });
      setInfo(d.summary || d.intent ? { summary: d.summary, intent: d.intent } : null);
      if (d.needsReply === false) {
        setText("");
        toast.info("This message does not need an answer. You can mark it done.");
      } else {
        setText(d.body);
        onDraft({ body: d.body });
      }
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
      const r = await post<{ sentTo: string }>("/api/inbox/send", { id: item.id, kind, body: text });
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
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-mist">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
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
              <p className="mb-1 text-xs opacity-70">
                {m.fromMe ? "You" : m.from} · {new Date(m.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
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
          {kind && (
            <>
              <label htmlFor="draft-text" className="label">
                {kind === "reply" ? "Your reply" : `Follow-up ${item.follow_up_count + 1}`}
              </label>
              <textarea
                id="draft-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onDraft({ body: e.target.value });
                }}
                rows={6}
                maxLength={5000}
                placeholder={kind === "reply" ? "Write your reply, or let the AI suggest one." : "Write a follow-up, or let the AI suggest one."}
                className="input"
              />
              <p className="text-xs text-ink-soft">The AI only suggests. Read and change the text, then press Send. It goes out inside the same conversation.</p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {kind && (
              <>
                <button type="button" onClick={writeDraft} disabled={busy !== "" || !messages} className="btn-secondary min-h-[40px] px-3.5 text-sm">
                  {busy === "draft" ? <SpinnerIcon /> : null} {kind === "reply" ? "Understand and draft reply" : "Draft follow-up"}
                </button>
                <button type="button" onClick={send} disabled={busy !== "" || !text.trim()} className="btn-primary min-h-[40px] px-4 text-sm">
                  {busy === "send" ? <SpinnerIcon /> : <CheckIcon className="h-4 w-4" />} Send
                </button>
              </>
            )}
            {item.status === "closed" ? (
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
