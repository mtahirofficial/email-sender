"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, MarkReadIcon, SpinnerIcon, StarIcon } from "@/components/icons";

export type MailItem = { id: string; threadId: string; from: string; subject: string; snippet: string; at: number; unread: boolean; starred: boolean; isReply: boolean };

/** "Ann Lee <ann@x.com>" -> "Ann Lee" (or the address when there is no name) */
export const senderName = (from: string) => from.replace(/<[^>]*>/, "").replace(/^["'\s]+|["'\s]+$/g, "") || from;
export const senderAddress = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

function when(at: number) {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/**
 * The whole inbox of one Gmail account, 50 messages a page, newest first, like Gmail. It lists everything,
 * including replies to emails that were not sent with Outbox. Gmail only moves forward page by page, so the
 * tokens of the pages already seen are remembered to allow "Newer".
 */
export default function FullInbox({ accountId, onOpen }: { accountId: string; onOpen: (mail: MailItem) => void }) {
  const [tokens, setTokens] = useState<string[]>([""]); // tokens[i] is the token that loads page i
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<MailItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (token: string, q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ account: accountId });
        if (token) params.set("page", token);
        if (q) params.set("q", q);
        const res = await fetch(`/api/inbox/mail?${params}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(typeof data.error === "string" ? data.error : "Could not load the inbox."), { needsPermission: Boolean(data.needsPermission) });
        setItems(data.items as MailItem[]);
        setNext((data.nextPageToken as string | null) ?? null);
        setError(null);
        setNeedsPermission(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the inbox.");
        setNeedsPermission(Boolean((err as { needsPermission?: boolean }).needsPermission));
      } finally {
        setLoading(false);
      }
    },
    [accountId]
  );

  // a different mailbox or a new search starts again from the first page
  useEffect(() => {
    setTokens([""]);
    setPage(0);
    setItems(null);
    void load("", query);
  }, [accountId, query, load]);

  function older() {
    if (!next) return;
    setTokens((t) => [...t.slice(0, page + 1), next]);
    setPage(page + 1);
    void load(next, query);
  }
  function newer() {
    if (page === 0) return;
    setPage(page - 1);
    void load(tokens[page - 1], query);
  }

  async function updateMessage(mail: MailItem, action: "mark-read" | "star" | "unstar") {
    const key = `${mail.id}:${action}`;
    setActionBusy(key);
    try {
      const res = await fetch("/api/inbox/mail/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: accountId, threadId: mail.threadId, messageId: mail.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsPermission) setNeedsPermission(true);
        throw new Error(typeof data.error === "string" ? data.error : "Could not update this message.");
      }
      await load(tokens[page] ?? "", query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this message.");
    } finally {
      setActionBusy(null);
    }
  }

  const first = page * 50 + 1;
  const pager = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={newer} disabled={page === 0 || loading} className="btn-secondary min-h-[36px] px-3 text-xs">
        Newer
      </button>
      <span className="text-xs text-ink-soft">{items && items.length > 0 ? `${first}–${first + items.length - 1}` : "No messages"}</span>
      <button type="button" onClick={older} disabled={!next || loading} className="btn-secondary min-h-[36px] px-3 text-xs">
        Older
      </button>
      {loading && <SpinnerIcon className="h-4 w-4" />}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(typed.trim());
          }}
          className="flex min-w-0 flex-1 gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search this inbox, for example: from:ann or price"
            aria-label="Search this inbox"
            maxLength={200}
            className="input min-w-0 flex-1"
          />
          <button type="submit" className="btn-secondary min-h-[40px] px-3.5 text-sm">
            Search
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setTyped("");
                setQuery("");
              }}
              className="btn-ghost min-h-[40px] px-3 text-sm"
            >
              Clear
            </button>
          )}
        </form>
        {pager}
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {needsPermission && <a className="mt-2 inline-flex text-sm font-medium text-accent underline" href="/oauth/google?inbox=1&next=%2Finbox">Reconnect Gmail to manage messages</a>}

      {!items && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
          <SpinnerIcon className="h-4 w-4" /> Reading the inbox...
        </p>
      )}

      {items && (
        <ul className={`mt-3 max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain pr-1 ${loading ? "opacity-60" : ""}`}>
          {items.length === 0 && <li className="px-2 py-8 text-center text-sm text-ink-soft">{query ? "Nothing matches that search." : "The inbox is empty."}</li>}
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-lg hover:bg-mist">
              <button type="button" onClick={() => onOpen(m)} className="block min-w-0 flex-1 rounded-lg px-2 py-2.5 text-left">
                <div className="flex items-center gap-x-3">
                  <span className={`min-w-0 flex-1 truncate text-sm ${m.unread ? "font-semibold text-ink" : "text-ink"}`}>{senderName(m.from)}</span>
                  {m.isReply && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">Reply</span>}
                  <span className="shrink-0 text-xs text-ink-soft">{when(m.at)}</span>
                </div>
                <p className={`truncate text-sm ${m.unread ? "font-medium text-ink" : "text-ink-soft"}`}>{m.subject || "(no subject)"}</p>
                <p className="truncate text-xs text-ink-soft">{m.snippet}</p>
              </button>
              <div className="flex shrink-0 items-center">
                {m.unread && <button type="button" disabled={actionBusy === `${m.id}:mark-read`} onClick={() => void updateMessage(m, "mark-read")} title="Mark thread as read" aria-label={`Mark thread from ${senderName(m.from)} as read`} className="rounded-md p-2 text-ink-soft hover:bg-white hover:text-ink disabled:opacity-50"><MarkReadIcon className="h-4 w-4" /></button>}
                <button type="button" disabled={actionBusy === `${m.id}:${m.starred ? "unstar" : "star"}`} onClick={() => void updateMessage(m, m.starred ? "unstar" : "star")} title={m.starred ? "Remove star" : "Star message"} aria-label={`${m.starred ? "Remove star from" : "Star"} message from ${senderName(m.from)}`} className={`rounded-md p-2 hover:bg-white disabled:opacity-50 ${m.starred ? "text-amber-500" : "text-ink-soft hover:text-amber-500"}`}><StarIcon className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {pager}
        <p className="text-xs text-ink-soft">Use the envelope to mark a thread read, or the star to save a message.</p>
      </div>}
    </div>
  );
}
