"use client";

import { useMemo, useState } from "react";
import type { EmailLog } from "@/lib/email-logs";
import LocalTime from "@/components/LocalTime";
import { CheckIcon, InboxIcon, SearchIcon, XIcon } from "@/components/icons";

export default function SentList({ logs }: { logs: EmailLog[] }) {
  const failed = logs.filter((l) => l.status === "failed").length;
  const sent = logs.length - failed;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "sent" | "failed">("all");
  const visible = useMemo(() => logs.filter((log) => {
    const text = `${log.to_email} ${log.from_email} ${log.subject}`.toLowerCase();
    return (filter === "all" || log.status === filter) && text.includes(query.toLowerCase().trim());
  }), [logs, query, filter]);

  return (
    <section aria-labelledby="sent-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-accent-deep">Your mailbox activity</p>
          <h1 id="sent-heading" className="mt-2 font-serif text-3xl text-ink">
            Sent history
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review your latest {logs.length > 0 ? logs.length : ""} send attempts, with results and error details.
          </p>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search email history</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipient, subject, or sender" className="input-sm h-10 pl-9" />
        </label>
        <div className="flex items-center gap-1 rounded-xl bg-paper p-1" aria-label="Filter by result">
          {(["all", "sent", "failed"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-8 rounded-lg px-3 text-xs font-medium capitalize ${filter === value ? "bg-white text-accent-deep shadow-sm" : "text-ink-soft hover:text-ink"}`}>{value === "all" ? "All" : value}</button>)}
        </div>
        <div className="flex gap-2">
          <span className="pill border-accent/20 bg-accent-soft text-accent-deep">{sent} sent</span>
          {failed > 0 && <span className="pill border-amber/20 bg-amber-soft text-amber">{failed} failed</span>}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent-deep"><InboxIcon className="h-6 w-6" /></span>
          <p className="mt-4 font-serif text-xl text-ink">Nothing sent yet</p>
          <p className="mt-1 text-sm text-ink-soft">Messages you send will show up here.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-soft">No messages match this search.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(180px,1.4fr)_minmax(160px,1fr)_140px_100px] gap-4 border-b border-line bg-paper px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft lg:grid">
            <span>Recipient</span><span>Subject</span><span>Sending account</span><span>Date</span><span>Result</span>
          </div>
          <ul className="divide-y divide-line">
          {visible.map((log) => {
            const ok = log.status === "sent";
            return (
              <li key={log.id} className="grid gap-2 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(150px,1fr)_minmax(180px,1.4fr)_minmax(160px,1fr)_140px_100px] lg:items-center lg:gap-4">
                <div className="min-w-0"><p className="text-[11px] font-medium uppercase text-ink-soft lg:hidden">Recipient</p><p className="truncate text-sm font-medium text-ink" title={log.to_email}>{log.to_email}</p></div>
                <div className="min-w-0"><p className="text-[11px] font-medium uppercase text-ink-soft lg:hidden">Subject</p><p className="truncate text-sm text-ink" title={log.subject}>{log.subject || "(No subject)"}</p>{!ok && log.error && <p className="mt-1 line-clamp-2 text-xs text-amber">{log.error}</p>}</div>
                <div className="min-w-0"><p className="text-[11px] font-medium uppercase text-ink-soft lg:hidden">Sending account</p><p className="truncate text-xs text-ink-soft" title={log.from_email}>{log.from_email}</p></div>
                <p className="text-xs text-ink-soft"><span className="mr-2 lg:hidden">Date</span><LocalTime iso={log.sent_at} /></p>
                <span className={`pill w-fit ${ok ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-amber/20 bg-amber-soft text-amber"}`}>
                  {ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}{ok ? "Sent" : "Failed"}
                </span>
              </li>
            );
          })}
          </ul>
        </div>
      )}
    </section>
  );
}
