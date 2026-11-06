"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

export type MailItem = { id: string; threadId: string; from: string; subject: string; snippet: string; at: number; unread: boolean; isReply: boolean };

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
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load the inbox.");
        setItems(data.items as MailItem[]);
        setNext((data.nextPageToken as string | null) ?? null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the inbox.");
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

      {!items && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
          <SpinnerIcon className="h-4 w-4" /> Reading the inbox...
        </p>
      )}

      {items && (
        <ul className={`mt-3 max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain pr-1 ${loading ? "opacity-60" : ""}`}>
          {items.length === 0 && <li className="px-2 py-8 text-center text-sm text-ink-soft">{query ? "Nothing matches that search." : "The inbox is empty."}</li>}
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpen(m)} className="block w-full rounded-lg px-2 py-2.5 text-left hover:bg-mist">
                <div className="flex items-center gap-x-3">
                  <span className={`min-w-0 flex-1 truncate text-sm ${m.unread ? "font-semibold text-ink" : "text-ink"}`}>{senderName(m.from)}</span>
                  {m.isReply && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">Reply</span>}
                  <span className="shrink-0 text-xs text-ink-soft">{when(m.at)}</span>
                </div>
                <p className={`truncate text-sm ${m.unread ? "font-medium text-ink" : "text-ink-soft"}`}>{m.subject || "(no subject)"}</p>
                <p className="truncate text-xs text-ink-soft">{m.snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {pager}
        <p className="text-xs text-ink-soft">Opening a message here does not mark it as read in Gmail.</p>
      </div>}
    </div>
  );
}
