"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import { useConfirmAction } from "@/components/ConfirmAction";

type Status = "queued" | "sending" | "sent" | "failed";
type Item = { to: string; status: Status; at: string; error?: string; since?: string };
type Account = { id: string; email: string; counts: Record<Status, number>; items: Item[] };
type Log = { configured: boolean; day?: string; now: string; active?: boolean; accounts: Account[] };

const SHOW_FIRST = 60; // long lists are cut to the latest rows until "Show all" is pressed
const FILL = "rgba(46, 93, 80, 0.16)"; // see-through accent colour used for the progress bar behind a row

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Live log of today's sending, grouped by the address the emails go out from. Everything is read from the
 * database, so a refresh shows the same log. The next email of each sender has a see-through bar that fills
 * up until its send time; an email being sent pulses; a sent one says "Sent".
 */
export default function SendLog({
  automationId,
  title = "Sending log",
  description = "Today’s emails, grouped by the address they are sent from. It updates by itself and is still here after a refresh.",
  actions,
}: {
  automationId: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { askToConfirm, confirmationDialog } = useConfirmAction();
  const [, setTick] = useState(0);
  const clockOffset = useRef(0); // server time minus this computer's time, so the bars are right even if the clock is off
  const active = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/automation/log?automationId=${encodeURIComponent(automationId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? "Could not load the sending log.");
      clockOffset.current = Date.parse(data.now) - Date.now();
      active.current = Boolean(data.active);
      setLog(data as Log);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the sending log.");
    }
  }, [automationId]);

  async function cancelAccount(account: Account) {
    setCancellingId(account.id);
    try {
      const res = await fetch("/api/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel-account", automationId, accountId: account.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not cancel queued emails for ${account.email}.`);
      await load();
    } finally {
      setCancellingId(null);
    }
  }

  // Fetch now, then every 3 seconds while something is queued or sending (every 20 seconds otherwise).
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (document.visibilityState === "visible") await load();
      if (!stopped) timer = setTimeout(loop, active.current ? 3000 : 20000);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void loop();
    };
    void loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Redraw every second so the bars and countdowns move between fetches.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now() + clockOffset.current;
  const totals = (log?.accounts ?? []).reduce(
    (sum, a) => ({ sent: sum.sent + a.counts.sent, waiting: sum.waiting + a.counts.queued + a.counts.sending, failed: sum.failed + a.counts.failed }),
    { sent: 0, waiting: 0, failed: 0 }
  );

  function row(item: Item) {
    let percent = 0;
    let label = "";
    let tone = "text-ink-soft";
    let pulse = false;

    if (item.status === "sent") {
      label = `Sent · ${timeOf(item.at)}`;
      tone = "text-accent-deep";
    } else if (item.status === "failed") {
      label = "Failed";
      tone = "text-red-700";
    } else if (item.status === "sending") {
      percent = 100;
      pulse = true;
      label = "Sending...";
      tone = "text-accent-deep";
    } else if (item.since) {
      // the next email of this sender: a countdown bar up to its send time
      const start = new Date(item.since).getTime();
      const end = new Date(item.at).getTime();
      const left = Math.ceil((end - now) / 1000);
      percent = end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 100;
      label = left > 0 ? `Sends in ${left >= 60 ? `${Math.floor(left / 60)}m ${left % 60}s` : `${left}s`}` : "Sending shortly";
    } else {
      label = `Scheduled · ${timeOf(item.at)}`;
    }

    return (
      <li key={`${item.to}-${item.status}`} className={`relative overflow-hidden rounded-lg border ${item.status === "failed" ? "border-red-200 bg-red-50" : "border-line bg-white"}`}>
        {percent > 0 && (
          <div
            aria-hidden
            className={`absolute inset-y-0 left-0 ${pulse ? "animate-pulse" : ""}`}
            style={{ width: `${percent}%`, backgroundColor: FILL, transition: "width 1s linear" }}
          />
        )}
        <div
          className="relative flex items-center gap-3 px-3 py-2"
          role={item.status === "queued" && item.since ? "progressbar" : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.status === "queued" && item.since ? Math.round(percent) : undefined}
          aria-label={item.status === "queued" && item.since ? `Progress until ${item.to} is sent` : undefined}
        >
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            <span className="text-ink-soft">to </span>
            {item.to}
          </span>
          <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${tone}`}>
            {item.status === "sent" && <CheckIcon className="h-3.5 w-3.5" />}
            {item.status === "sending" && <SpinnerIcon className="h-3.5 w-3.5" />}
            {item.status === "failed" && <AlertIcon className="h-3.5 w-3.5" />}
            {label}
          </span>
        </div>
        {item.status === "failed" && item.error && <p className="relative px-3 pb-2 text-xs text-red-700">{item.error}</p>}
      </li>
    );
  }

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="send-log-title">
      {confirmationDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="send-log-title" className="font-serif text-2xl text-ink">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {log?.active && (
            <span className="flex items-center gap-2 text-xs font-medium text-accent-deep">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Live
            </span>
          )}
          {actions}
        </div>
      </div>
      <p className="mb-4 mt-1 text-sm text-ink-soft">
        {description}
        {log && log.accounts.length > 0 && ` ${totals.sent} sent, ${totals.waiting} waiting${totals.failed ? `, ${totals.failed} failed` : ""}.`}
      </p>

      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertIcon className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {!log && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <SpinnerIcon className="h-4 w-4" /> Loading...
        </p>
      )}

      {log && log.accounts.length === 0 && (
        <p className="rounded-lg bg-mist px-3 py-4 text-center text-sm text-ink-soft">
          Nothing queued or sent today yet. When the daily schedule runs, each email appears here live.
        </p>
      )}

      <div className="space-y-6">
        {log?.accounts.map((account) => {
          const showAll = expanded.has(account.id) || account.items.length <= SHOW_FIRST;
          const items = showAll ? account.items : account.items.slice(-SHOW_FIRST);
          return (
            <div key={account.id}>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="min-w-0 break-all text-sm font-semibold text-ink">
                  <span className="font-normal text-ink-soft">From </span>
                  {account.email}
                </p>
                <p className="text-xs text-ink-soft">
                  {account.counts.sent} sent
                  {account.counts.sending + account.counts.queued > 0 ? ` · ${account.counts.sending + account.counts.queued} waiting` : ""}
                  {account.counts.failed > 0 ? ` · ${account.counts.failed} failed` : ""}
                </p>
                {account.counts.queued > 0 && (
                  <button
                    type="button"
                    disabled={cancellingId !== null}
                    onClick={() => askToConfirm({
                      title: `Cancel emails from ${account.email}?`,
                      description: `This cancels ${account.counts.queued} waiting email${account.counts.queued === 1 ? "" : "s"} for this account today. Emails already sent or currently sending are not affected.`,
                      confirmLabel: "Cancel waiting emails",
                      action: () => cancelAccount(account),
                    })}
                    className="btn-ghost min-h-8 px-2 text-xs text-red-700 hover:bg-red-500/10"
                  >
                    {cancellingId === account.id ? "Cancelling…" : "Cancel this account"}
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">{items.map(row)}</ul>
              {!showAll && (
                <button
                  type="button"
                  onClick={() => setExpanded((set) => new Set(set).add(account.id))}
                  className="mt-2 text-xs font-medium text-accent-deep underline underline-offset-2"
                >
                  Show all {account.items.length}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
