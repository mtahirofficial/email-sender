"use client";

import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon, SheetIcon, ShieldIcon, SparkleIcon, SendIcon, SpinnerIcon } from "@/components/icons";

export type GoogleAccount = { id: string; email: string; sheets_enabled: boolean };
export type SettingsView = {
  account_id: string | null;
  spreadsheet_id: string;
  sheet_title: string;
  website_col: string;
  email_col: string;
  sent_col: string;
  daily_limit: number;
  prompt: string;
};

type Stats = { total: number; websites: number; sent: number; pending: number };
type BatchItem = {
  row: number;
  website: string | null;
  email: string;
  subject: string;
  body: string;
  skip: boolean;
  status?: "sent" | "failed";
};
type Phase = "idle" | "preparing" | "review" | "sending" | "done";

const AI_CHUNK = 8; // emails written per AI request
const SEND_CHUNK = 10; // emails sent per request

class ApiError extends Error {
  constructor(message: string, public reconnect?: "google" | "microsoft") {
    super(message);
  }
}

const reconnectOf = (err: unknown) => (err instanceof ApiError ? err.reconnect ?? null : null);

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", data.reconnect);
  return data;
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-serif text-xl text-ink">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-accent/20 bg-accent-soft text-accent-deep"
      }`}
    >
      {tone === "error" ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

export default function AutomationPanel({ accounts, settings }: { accounts: GoogleAccount[]; settings: SettingsView | null }) {
  const sheetsAccounts = accounts.filter((a) => a.sheets_enabled);

  // ---- setup form ----
  const [accountId, setAccountId] = useState(settings?.account_id ?? sheetsAccounts[0]?.id ?? "");
  const [sheetUrl, setSheetUrl] = useState(settings ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : "");
  const [cols, setCols] = useState({
    website: settings?.website_col ?? "B",
    email: settings?.email_col ?? "C",
    sent: settings?.sent_col ?? "D",
  });
  const [dailyLimit, setDailyLimit] = useState(settings?.daily_limit ?? 20);
  const [prompt, setPrompt] = useState(settings?.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupOk, setSetupOk] = useState<string | null>(null);

  // ---- status ----
  const [configured, setConfigured] = useState(Boolean(settings));
  const [tabTitle, setTabTitle] = useState(settings?.sheet_title ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [sentToday, setSentToday] = useState(0);
  const [limit, setLimit] = useState(settings?.daily_limit ?? 20);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ---- daily batch ----
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickFailed, setTickFailed] = useState(false);
  const [reconnect, setReconnect] = useState<"google" | "microsoft" | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  // The prepared batch is saved on the server, so a connection problem (or a closed tab)
  // never costs another round of AI writing.
  async function saveDraft(items: BatchItem[]) {
    try {
      await fetch("/api/automation/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {
      // best effort
    }
  }

  async function deleteDraft() {
    try {
      await fetch("/api/automation/draft", { method: "DELETE" });
    } catch {
      // best effort
    }
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/automation/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data.error ?? "Could not read the sheet.", data.reconnect);
      if (data.configured) {
        setStats(data.stats);
        setSentToday(data.sentToday);
        setLimit(data.limit);
        setStatusError(null);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not read the sheet.");
      setReconnect(reconnectOf(err));
    }
  }

  useEffect(() => {
    if (!settings) return;
    void refreshStatus();
    (async () => {
      try {
        const res = await fetch("/api/automation/draft", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.draft?.items?.length) {
          setBatch(data.draft.items as BatchItem[]);
          setPhase("review");
          setDraftNote(new Date(data.draft.updatedAt).toLocaleString());
        }
      } catch {
        // no draft to restore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the saved draft in step with edits made while reviewing.
  useEffect(() => {
    if (phase !== "review" || batch.length === 0) return;
    const timer = setTimeout(() => void saveDraft(batch), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, phase]);

  async function importSheet(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSetupError(null);
    setSetupOk(null);
    setReconnect(null);
    try {
      const data = await postJson("/api/automation/settings", {
        accountId,
        sheetUrl,
        websiteCol: cols.website,
        emailCol: cols.email,
        sentCol: cols.sent,
        dailyLimit,
        prompt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setConfigured(true);
      setTabTitle(data.sheetTitle);
      setStats(data.stats);
      setSentToday(data.sentToday);
      setLimit(dailyLimit);
      setStatusError(null);
      setSetupOk(`Imported "${data.sheetTitle}". ${data.stats.pending} email${data.stats.pending === 1 ? "" : "s"} still to send.`);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Could not import the sheet.");
      setReconnect(reconnectOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function prepare() {
    setPhase("preparing");
    setBatchError(null);
    setNotice(null);
    setTickFailed(false);
    setReconnect(null);
    setDraftNote(null);
    setBatch([]);
    try {
      const next = await postJson("/api/automation/next");
      setStats(next.stats);
      setSentToday(next.sentToday);
      setLimit(next.limit);

      const items = next.items as { row: number; website: string | null; email: string }[];
      if (items.length === 0) {
        setNotice(
          next.sentToday >= next.limit
            ? `Today's limit is reached (${next.sentToday} of ${next.limit}). Come back tomorrow.`
            : "Nothing left to send. Add more rows to your sheet."
        );
        setPhase("idle");
        return;
      }

      const written: BatchItem[] = [];
      for (let i = 0; i < items.length; i += AI_CHUNK) {
        const chunk = items.slice(i, i + AI_CHUNK);
        setProgress({ done: i, total: items.length });
        const data = await postJson("/api/ai/email", {
          prompt: next.prompt,
          count: chunk.length,
          websites: chunk.map((c) => c.website ?? ""),
        });
        chunk.forEach((c, j) => written.push({ ...c, subject: data.items[j].subject, body: data.items[j].body, skip: false }));
      }
      setBatch(written);
      setPhase("review");
      await saveDraft(written);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Could not prepare the batch.");
      setReconnect(reconnectOf(err));
      setPhase("idle");
    } finally {
      setProgress(null);
    }
  }

  async function sendBatch() {
    setPhase("sending");
    setBatchError(null);
    setReconnect(null);

    let working = batch;
    let stoppedByError = false;
    const queue = batch.filter((b) => !b.skip && b.status !== "sent");

    try {
      for (let i = 0; i < queue.length; i += SEND_CHUNK) {
        const chunk = queue.slice(i, i + SEND_CHUNK);
        setProgress({ done: i, total: queue.length });
        const data = await postJson("/api/automation/send", {
          items: chunk.map(({ row, website, email, subject, body }) => ({ row, website, email, subject, body })),
        });
        if (data.tickFailed) setTickFailed(true);
        const results = data.results as { email: string; ok: boolean }[];
        working = working.map((b) => {
          const r = results.find((x) => x.email === b.email);
          return r ? { ...b, status: r.ok ? ("sent" as const) : ("failed" as const) } : b;
        });
        setBatch(working);
        setSentToday(data.sentToday);
      }
    } catch (err) {
      stoppedByError = true;
      setBatchError(err instanceof Error ? err.message : "Sending stopped.");
      setReconnect(reconnectOf(err));
    } finally {
      setProgress(null);
    }

    if (stoppedByError) {
      // Back to review with everything intact; fix the problem, then press Send again.
      setPhase("review");
      await saveDraft(working);
    } else {
      setPhase("done");
      await deleteDraft();
    }
    void refreshStatus();
  }

  const update = (row: number, patch: Partial<BatchItem>) =>
    setBatch((prev) => prev.map((b) => (b.row === row ? { ...b, ...patch } : b)));

  const toSend = batch.filter((b) => !b.skip && b.status !== "sent").length;
  const sentCount = batch.filter((b) => b.status === "sent").length;
  const failedCount = batch.filter((b) => b.status === "failed").length;
  const busy = phase === "preparing" || phase === "sending";

  // ---------------------------------------------------------------- render

  return (
    <div className="space-y-6">
      {/* 1. Google Sheets access */}
      <Card title="Google Sheets access" icon={<ShieldIcon className="h-5 w-5 text-accent" />}>
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Connect a Gmail account on the <a href="/compose" className="text-accent-deep underline underline-offset-2">Compose</a> page first.
            Automation sends through Gmail.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Outbox needs permission to read your sheet and to write the &ldquo;sent&rdquo; tick next to each address.
              Google words this permission as access to your spreadsheets, but Outbox only opens the one sheet you link below.
            </p>
            {sheetsAccounts.length > 0 && (
              <p className="mt-3 text-sm text-accent-deep">
                Enabled for: {sheetsAccounts.map((a) => a.email).join(", ")}
              </p>
            )}
            <a href="/oauth/google?sheets=1" className="btn-secondary mt-4">
              <SheetIcon className="h-4 w-4 text-accent" />
              {sheetsAccounts.length > 0 ? "Enable for another Gmail account" : "Enable Google Sheets"}
            </a>
          </>
        )}
      </Card>

      {/* 2. Import */}
      {sheetsAccounts.length > 0 && (
        <Card title={configured ? "Your sheet" : "Import your sheet"} icon={<SheetIcon className="h-5 w-5 text-accent" />}>
          <form onSubmit={importSheet} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="sheet-url" className="label">Google Sheet link</label>
                <input
                  id="sheet-url"
                  required
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="input"
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  Paste a link that includes the tab you want (the part with gid=). The sheet must be accessible to the Gmail account below.
                </p>
              </div>
              <div>
                <label htmlFor="acct" className="label">Gmail account</label>
                <select id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
                  {sheetsAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.email}</option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="label">Columns</legend>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["website", "Website"],
                    ["email", "Emails"],
                    ["sent", "Sent tick"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`col-${key}`} className="mb-1 block text-xs text-ink-soft">{label}</label>
                    <input
                      id={`col-${key}`}
                      required
                      maxLength={1}
                      value={cols[key]}
                      onChange={(e) => setCols((c) => ({ ...c, [key]: e.target.value.toUpperCase() }))}
                      className="input text-center uppercase"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">
                Each website sits on its first row; its emails go one per row below it (in the Emails column). Rows with an
                empty website belong to the website above. A tick is written next to each address once it is emailed.
              </p>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
              <div>
                <label htmlFor="daily" className="label">Emails per day</label>
                <input
                  id="daily"
                  type="number"
                  required
                  min={1}
                  max={200}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="ai-instructions" className="label">What should every email say?</label>
                <textarea
                  id="ai-instructions"
                  required
                  rows={5}
                  minLength={10}
                  maxLength={1500}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Introduce our website audit service, offer a free 15-minute call, keep it short and friendly. Mention the recipient's website."
                  className="input resize-y"
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  The AI writes a different subject (with the website) and message for every address. Your instructions are sent to an AI
                  provider; email addresses are not.
                </p>
              </div>
            </div>

            {setupError && <Alert>{setupError}</Alert>}
            {setupOk && <Alert tone="ok">{setupOk}</Alert>}
            {reconnect === "google" && (setupError || statusError) && (
              <a href="/oauth/google?sheets=1&next=/automation" className="btn-primary">Reconnect Gmail</a>
            )}

            <button type="submit" disabled={saving} className="btn-primary">
              {saving && <SpinnerIcon />} {configured ? "Save and re-import" : "Import sheet"}
            </button>
          </form>
        </Card>
      )}

      {/* 3. Today */}
      {configured && (
        <Card title="Today" icon={<SparkleIcon className="h-5 w-5 text-accent" />}>
          {statusError && <div className="mb-4"><Alert>{statusError}</Alert></div>}

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["In sheet", stats?.total],
              ["Websites", stats?.websites],
              ["Already sent", stats?.sent],
              ["Still to send", stats?.pending],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-line bg-paper px-4 py-3">
                <p className="font-serif text-2xl text-ink">{value ?? "…"}</p>
                <p className="text-xs text-ink-soft">{label}</p>
              </div>
            ))}
          </div>

          <p className="mb-4 text-sm text-ink-soft">
            Sent today: <strong className="text-ink">{sentToday}</strong> of {limit}
            {tabTitle && <> · Tab: <span className="text-ink">{tabTitle}</span></>}
          </p>

          {phase !== "review" && phase !== "sending" && (
            <button type="button" onClick={prepare} disabled={busy} className="btn-primary">
              {phase === "preparing" ? <SpinnerIcon /> : <SparkleIcon className="h-4 w-4" />}
              {phase === "preparing"
                ? progress
                  ? `Writing ${Math.min(progress.done + AI_CHUNK, progress.total)} of ${progress.total}…`
                  : "Reading your sheet…"
                : phase === "done"
                ? "Prepare the next batch"
                : "Prepare today's batch"}
            </button>
          )}

          <div aria-live="polite" className="mt-4 space-y-3">
            {notice && <Alert tone="ok">{notice}</Alert>}
            {batchError && <Alert>{batchError}</Alert>}
            {reconnect === "google" && (
              <div className="space-y-2">
                <a href="/oauth/google?sheets=1&next=/automation" className="btn-primary">Reconnect Gmail</a>
                <p className="text-xs text-ink-soft">Your prepared emails are saved. After reconnecting you can send them without writing them again.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 4. Review and send */}
      {batch.length > 0 && (
        <Card title={phase === "done" ? "Results" : "Review and send"} icon={<SendIcon className="h-5 w-5 text-accent" />}>
          {phase === "done" && (
            <div className="mb-4 space-y-3">
              <Alert tone={failedCount > 0 ? "error" : "ok"}>
                Sent {sentCount}
                {failedCount > 0 ? `, ${failedCount} failed (they stay unticked and come back next time)` : ""}. Ticks were written to your sheet.
              </Alert>
              {tickFailed && (
                <Alert>The emails went out, but the ticks couldn&rsquo;t be written. They will be added automatically next time you prepare a batch.</Alert>
              )}
            </div>
          )}
          {draftNote && phase === "review" && (
            <p className="mb-3 text-xs text-accent-deep">Saved batch restored (from {draftNote}). Nothing had to be written again.</p>
          )}
          {phase === "review" && (
            <p className="mb-4 text-sm text-ink-soft">
              Check the subjects and messages. Edit anything, or tick &ldquo;Skip&rdquo; to leave an address for another day.
            </p>
          )}

          <ul className="max-h-[640px] space-y-3 overflow-y-auto rounded-xl border border-line bg-paper p-3">
            {batch.map((b) => (
              <li key={b.row} className={`rounded-lg border border-line bg-white p-3 ${b.skip ? "opacity-60" : ""}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-ink-soft">
                    <span className="font-medium text-ink">{b.website ?? "no website"}</span> · {b.email} · row {b.row}
                  </p>
                  {b.status ? (
                    <span className={`pill ${b.status === "sent" ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {b.status === "sent" ? "Sent" : "Failed"}
                    </span>
                  ) : (
                    <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-ink-soft">
                      <input
                        type="checkbox"
                        checked={b.skip}
                        disabled={phase !== "review"}
                        onChange={(e) => update(b.row, { skip: e.target.checked })}
                        className="h-4 w-4 accent-[#2E5D50]"
                      />
                      Skip
                    </label>
                  )}
                </div>
                <input
                  aria-label={`Subject for ${b.email}`}
                  value={b.subject}
                  disabled={phase !== "review" || b.status === "sent"}
                  onChange={(e) => update(b.row, { subject: e.target.value })}
                  className="input-sm mb-2"
                />
                <textarea
                  aria-label={`Message for ${b.email}`}
                  rows={5}
                  value={b.body}
                  disabled={phase !== "review" || b.status === "sent"}
                  onChange={(e) => update(b.row, { body: e.target.value })}
                  className="input-sm resize-y"
                />
              </li>
            ))}
          </ul>

          {phase === "review" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={sendBatch} disabled={toSend === 0} className="btn-primary">
                <SendIcon className="h-4 w-4" /> Send {toSend} email{toSend === 1 ? "" : "s"}
              </button>
              <button type="button" onClick={() => { setBatch([]); setPhase("idle"); setDraftNote(null); void deleteDraft(); }} className="btn-ghost">
                Discard
              </button>
            </div>
          )}
          {phase === "sending" && (
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft" aria-live="polite">
              <SpinnerIcon /> Sending {progress ? `${Math.min(progress.done + SEND_CHUNK, progress.total)} of ${progress.total}` : ""}… please keep this page open.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
