"use client";

import { useEffect, useState } from "react";
import PresetPicker from "@/components/PresetPicker";
import AiStatusNote from "@/components/AiStatusNote";
import { useToast } from "@/components/Toaster";
import LocalTime from "@/components/LocalTime";
import { reconnectHref } from "@/lib/reconnect";
import type { AiPreset } from "@/content/ai-presets";
import { AlertIcon, CheckIcon, SheetIcon, ShieldIcon, SparkleIcon, SendIcon, SpinnerIcon, UsersIcon } from "@/components/icons";

export type GoogleAccount = { id: string; email: string; sheets_enabled: boolean };
export type SenderView = { accountId: string; email: string; provider: "google" | "microsoft"; limit: number; enabled: boolean; needsReconnect: boolean };
export type SettingsView = {
  account_id: string | null;
  spreadsheet_id: string;
  sheet_title: string;
  website_col: string;
  email_col: string;
  sent_col: string;
  filter_col: string | null;
  filter_value: string | null;
  prompt: string;
  schedule_enabled: boolean;
  schedule_time: string;
  pause_seconds: number;
};

type Stats = { total: number; websites: number; sent: number; pending: number };
type QueueInfo = { queued: number; pending: number; sent: number; failed: number; nextAt: string | null };
type BatchItem = {
  row: number;
  website: string | null;
  email: string;
  accountId: string;
  fromEmail: string;
  subject: string;
  body: string;
  skip: boolean;
  status?: "sent" | "failed";
};
type Phase = "idle" | "preparing" | "review" | "sending" | "done";

// The "only rows where column ... equals ..." inputs are hidden for now. Their saved values still apply.
const SHOW_ROW_FILTER = false;

const AI_CHUNK = 8; // emails written per AI request
const SEND_CHUNK = 10; // emails sent per request

class ApiError extends Error {
  constructor(message: string, public reconnect?: "google" | "microsoft") {
    super(message);
  }
}
const reconnectOf = (err: unknown) => (err instanceof ApiError ? err.reconnect ?? null : null);
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

async function api(url: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
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

export default function AutomationPanel({
  accounts,
  settings,
  senders,
  presets,
  background,
}: {
  accounts: GoogleAccount[];
  settings: SettingsView | null;
  senders: SenderView[];
  presets: AiPreset[];
  /** Whether the server-side scheduler is calling the app, so runs continue with this page closed. */
  background: { active: boolean; isAdmin: boolean };
}) {
  const toast = useToast();
  const sheetsAccounts = accounts.filter((a) => a.sheets_enabled);

  // ---- sheet setup ----
  const [accountId, setAccountId] = useState(settings?.account_id ?? sheetsAccounts[0]?.id ?? "");
  const [sheetLink, setSheetLink] = useState(settings ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : "");
  const [sheetUrl, setSheetUrl] = useState(settings ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : "");
  const [cols, setCols] = useState({ website: settings?.website_col ?? "B", email: settings?.email_col ?? "E", sent: settings?.sent_col ?? "F" });
  const [filter, setFilter] = useState({ col: settings ? settings.filter_col ?? "" : "D", value: settings ? settings.filter_value ?? "" : "" });
  const [prompt, setPrompt] = useState(settings?.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupOk, setSetupOk] = useState<string | null>(null);

  // ---- status ----
  const [configured, setConfigured] = useState(Boolean(settings));
  const [tabTitle, setTabTitle] = useState(settings?.sheet_title ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reconnect, setReconnect] = useState<"google" | "microsoft" | null>(null);

  // ---- sending accounts ----
  const [rows, setRows] = useState(senders.map((s) => ({ ...s, limitText: String(s.limit) })));
  const [sendersBusy, setSendersBusy] = useState(false);
  const [sendersNote, setSendersNote] = useState<{ ok: boolean; text: string } | null>(null);

  // ---- schedule ----
  const [schedEnabled, setSchedEnabled] = useState(settings?.schedule_enabled ?? false);
  const [savedEnabled, setSavedEnabled] = useState(settings?.schedule_enabled ?? false);
  const [schedTime, setSchedTime] = useState(settings?.schedule_time ?? "10:00");
  const [pause, setPause] = useState(settings?.pause_seconds ?? 90);
  const [schedBusy, setSchedBusy] = useState<"save" | "run" | "cancel" | null>(null);
  const [schedNote, setSchedNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [schedError, setSchedError] = useState<string | null>(null);

  // ---- manual batch ----
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickFailed, setTickFailed] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function refreshStatus() {
    try {
      const data = await api("/api/automation/status", "GET");
      if (data.configured) {
        setStats(data.stats);
        if (typeof data.sheetUrl === "string") setSheetLink(data.sheetUrl);
        setUsed(data.used ?? {});
        setStatusError(null);
      }
    } catch (err) {
      setStatusError(message(err, "Could not read the sheet."));
      setReconnect(reconnectOf(err));
    }
  }

  async function refreshSchedule() {
    try {
      const data = await api("/api/automation/schedule", "GET");
      if (data.configured) {
        setQueue(data.queue);
        setSchedError(data.error ?? null);
      }
    } catch {
      // keep what is shown
    }
  }

  async function saveDraft(items: BatchItem[]) {
    try {
      await api("/api/automation/draft", "PUT", { items });
    } catch {
      // best effort
    }
  }
  async function deleteDraft() {
    try {
      await api("/api/automation/draft", "DELETE");
    } catch {
      // best effort
    }
  }

  useEffect(() => {
    if (!settings) return;
    void refreshStatus();
    void refreshSchedule();
    (async () => {
      try {
        const data = await api("/api/automation/draft", "GET");
        if (data.draft?.items?.length) {
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

  // While the schedule is on and this page is open, it also drives the schedule once a minute.
  useEffect(() => {
    if (!configured || !savedEnabled) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        await api("/api/automation/tick");
      } catch {
        // ignore; the next tick tries again
      }
      if (!cancelled) {
        void refreshSchedule();
        void refreshStatus();
      }
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, savedEnabled]);

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
      const data = await api("/api/automation/settings", "POST", {
        accountId,
        sheetUrl,
        websiteCol: cols.website,
        emailCol: cols.email,
        sentCol: cols.sent,
        filterCol: filter.col,
        filterValue: filter.value,
        prompt,
        timezone: timezone(),
      });
      setConfigured(true);
      setTabTitle(data.sheetTitle);
      setSheetLink(sheetUrl);
      setStats(data.stats);
      setStatusError(null);
      setSetupOk(`Imported "${data.sheetTitle}". ${data.stats.pending} email${data.stats.pending === 1 ? "" : "s"} still to send.`);
      toast.success(`Sheet imported. ${data.stats.pending} email${data.stats.pending === 1 ? "" : "s"} still to send.`);
      void refreshStatus();
    } catch (err) {
      setSetupError(message(err, "Could not import the sheet."));
      toast.error(message(err, "Could not import the sheet."));
      setReconnect(reconnectOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveSenders() {
    setSendersBusy(true);
    setSendersNote(null);
    try {
      await api("/api/automation/senders", "POST", {
        senders: rows.map((r) => ({ accountId: r.accountId, enabled: r.enabled, limit: Number(r.limitText) })),
      });
      setSendersNote({ ok: true, text: "Saved." });
      toast.success("Sending accounts saved.");
    } catch (err) {
      setSendersNote({ ok: false, text: message(err, "Could not save.") });
      toast.error(message(err, "Could not save the sending accounts."));
    } finally {
      setSendersBusy(false);
    }
  }

  async function scheduleAction(action: "save" | "run" | "cancel") {
    setSchedBusy(action);
    setSchedNote(null);
    try {
      if (action === "save") {
        await api("/api/automation/schedule", "POST", { action: "save", enabled: schedEnabled, time: schedTime, pauseSeconds: pause, timezone: timezone() });
        setSavedEnabled(schedEnabled);
        setSchedNote({ ok: true, text: schedEnabled ? `Schedule saved. It runs every day at ${schedTime}.` : "Schedule turned off." });
        toast.success(schedEnabled ? `Schedule saved. It runs every day at ${schedTime}.` : "Schedule turned off.");
      } else if (action === "run") {
        const data = await api("/api/automation/schedule", "POST", { action: "run-now" });
        setSchedNote({ ok: !data.note, text: data.note ?? `Queued ${data.prepared} email${data.prepared === 1 ? "" : "s"}. They are sent with pauses of about ${pause} seconds per account.` });
        if (data.note) toast.info(data.note);
        else toast.success(`Queued ${data.prepared} email${data.prepared === 1 ? "" : "s"}. They are sent with pauses between them.`);
      } else {
        await api("/api/automation/schedule", "POST", { action: "cancel" });
        setSchedNote({ ok: true, text: "Cancelled the emails that were still waiting." });
        toast.info("Cancelled the emails that were still waiting.");
      }
      void refreshSchedule();
      void refreshStatus();
    } catch (err) {
      setSchedNote({ ok: false, text: message(err, "Something went wrong.") });
      toast.error(message(err, "Something went wrong."));
      setReconnect(reconnectOf(err));
    } finally {
      setSchedBusy(null);
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
      const next = await api("/api/automation/next");
      setStats(next.stats);

      const items = next.items as Omit<BatchItem, "subject" | "body" | "skip">[];
      if (items.length === 0) {
        setNotice(
          next.skipped?.length
            ? `Nothing to send: ${next.skipped.join(", ")} needs to be reconnected, and the other accounts are at their limit or there are no unsent addresses.`
            : "Nothing to send: every account is at its daily limit, or no unsent addresses are left."
        );
        setPhase("idle");
        return;
      }

      const written: BatchItem[] = [];
      let aiStopped: unknown = null;
      for (let i = 0; i < items.length; i += AI_CHUNK) {
        const chunk = items.slice(i, i + AI_CHUNK);
        setProgress({ done: i, total: items.length });
        try {
          const data = await api("/api/ai/email", "POST", { prompt: next.prompt, count: chunk.length, websites: chunk.map((c) => c.website ?? "") });
          chunk.forEach((c, j) => written.push({ ...c, subject: data.items[j].subject, body: data.items[j].body, skip: false }));
        } catch (err) {
          aiStopped = err; // keep what is already written: those AI credits are not thrown away
          break;
        }
      }
      if (written.length === 0 && aiStopped) throw aiStopped;
      setBatch(written);
      setPhase("review");
      await saveDraft(written);
      if (aiStopped) {
        const text = `${message(aiStopped, "The AI stopped.")} ${written.length} of ${items.length} emails are ready to review. Prepare again later for the rest.`;
        setBatchError(text);
        toast.error(text);
      } else {
        toast.success(`${written.length} email${written.length === 1 ? "" : "s"} written. Review them, then send.`);
      }
    } catch (err) {
      setBatchError(message(err, "Could not prepare the batch."));
      toast.error(message(err, "Could not prepare the batch."));
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
    const queueItems = batch.filter((b) => !b.skip && b.status !== "sent");

    try {
      for (let i = 0; i < queueItems.length; i += SEND_CHUNK) {
        const chunk = queueItems.slice(i, i + SEND_CHUNK);
        setProgress({ done: i, total: queueItems.length });
        const data = await api("/api/automation/send", "POST", {
          items: chunk.map(({ row, website, email, subject, body, accountId }) => ({ row, website, email, subject, body, accountId })),
        });
        if (data.tickFailed) setTickFailed(true);
        const results = data.results as { email: string; ok: boolean }[];
        working = working.map((b) => {
          const r = results.find((x) => x.email === b.email);
          return r ? { ...b, status: r.ok ? ("sent" as const) : ("failed" as const) } : b;
        });
        setBatch(working);
      }
    } catch (err) {
      stoppedByError = true;
      setBatchError(message(err, "Sending stopped."));
      toast.error(message(err, "Sending stopped."));
      setReconnect(reconnectOf(err));
    } finally {
      setProgress(null);
    }

    if (stoppedByError) {
      setPhase("review");
      await saveDraft(working);
    } else {
      setPhase("done");
      await deleteDraft();
      const sentNow = working.filter((b) => b.status === "sent").length;
      const failedNow = working.filter((b) => b.status === "failed").length;
      if (failedNow > 0) toast.error(`${sentNow} sent, ${failedNow} failed. See the list for details.`);
      else toast.success(`${sentNow} email${sentNow === 1 ? "" : "s"} sent.`);
    }
    void refreshStatus();
  }

  const update = (row: number, email: string, patch: Partial<BatchItem>) =>
    setBatch((prev) => prev.map((b) => (b.row === row && b.email === email ? { ...b, ...patch } : b)));

  const toSend = batch.filter((b) => !b.skip && b.status !== "sent").length;
  const sentCount = batch.filter((b) => b.status === "sent").length;
  const failedCount = batch.filter((b) => b.status === "failed").length;
  const sheetButton = sheetLink ? (
    <a href={sheetLink} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-[40px] px-3.5 text-sm">
      <SheetIcon className="h-4 w-4" /> Open sheet
    </a>
  ) : null;
  const busy = phase === "preparing" || phase === "sending";
  const reconnectLink = (
    <a href="/oauth/google?sheets=1&next=/automation" className="btn-primary">
      Reconnect Gmail
    </a>
  );

  // ---------------------------------------------------------------- render

  return (
    <div className="space-y-6">
      {/* 1. Google Sheets access */}
      <Card title="Google Sheets access" icon={<ShieldIcon className="h-5 w-5 text-accent" />}>
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Connect a Gmail account on the <a href="/compose" className="text-accent-deep underline underline-offset-2">Compose</a> page first.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Outbox needs permission to read your sheet and to mark each address once it has been emailed. Google words this permission as
              access to your spreadsheets, but Outbox only opens the one sheet you link below.
            </p>
            {sheetsAccounts.length > 0 && <p className="mt-3 text-sm text-accent-deep">Enabled for: {sheetsAccounts.map((a) => a.email).join(", ")}</p>}
            <a href="/oauth/google?sheets=1" className="btn-secondary mt-4">
              <SheetIcon className="h-4 w-4 text-accent" />
              {sheetsAccounts.length > 0 ? "Enable for another Gmail account" : "Enable Google Sheets"}
            </a>
          </>
        )}
      </Card>

      {/* 2. Sheet + prompt */}
      {sheetsAccounts.length > 0 && (
        <Card title={configured ? "Your sheet" : "Import your sheet"} icon={<SheetIcon className="h-5 w-5 text-accent" />}>
          <form onSubmit={importSheet} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="sheet-url" className="label">Google Sheet link</label>
                <input id="sheet-url" required type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="input" />
                <p className="mt-1.5 text-xs text-ink-soft">Include the tab you want (the part with gid=). It must be open to the Google account below.</p>
              </div>
              <div>
                <label htmlFor="acct" className="label">Google account that reads the sheet</label>
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
                    ["website", "Domain"],
                    ["email", "Emails (comma separated)"],
                    ["sent", "Sent marks"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`col-${key}`} className="mb-1 block text-xs text-ink-soft">{label}</label>
                    <input id={`col-${key}`} required maxLength={1} value={cols[key]} onChange={(e) => setCols((c) => ({ ...c, [key]: e.target.value.toUpperCase() }))} className="input text-center uppercase" />
                  </div>
                ))}
              </div>
              {SHOW_ROW_FILTER && (
              <div className="mt-3 grid grid-cols-[90px_1fr] gap-3">
                <div>
                  <label htmlFor="filter-col" className="mb-1 block text-xs text-ink-soft">Only rows where column</label>
                  <input id="filter-col" maxLength={1} value={filter.col} onChange={(e) => setFilter((f) => ({ ...f, col: e.target.value.toUpperCase() }))} className="input text-center uppercase" />
                </div>
                <div>
                  <label htmlFor="filter-value" className="mb-1 block text-xs text-ink-soft">equals (leave empty to use every row)</label>
                  <input id="filter-value" value={filter.value} onChange={(e) => setFilter((f) => ({ ...f, value: e.target.value }))} className="input" placeholder="Yes" />
                </div>
              </div>
              )}
              <p className="mt-1.5 text-xs text-ink-soft">
                One row per website, with all its emails in one cell. After an email is sent, <span className="font-medium text-ink">✓ address</span> is added to the
                sent column of that row. Obvious placeholders such as you@company.com are skipped.
              </p>
            </fieldset>

            <div>
              <label htmlFor="ai-instructions" className="label">What should every email say?</label>
              <PresetPicker presets={presets} value={prompt} onPick={setPrompt} />
              <textarea
                id="ai-instructions"
                required
                rows={7}
                minLength={10}
                maxLength={1500}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Pick a preset above or describe the email. The AI writes a different subject (mentioning the website) and message for every address."
                className="input resize-y"
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                This prompt is used for the button batch and for the daily schedule. Your instructions go to an AI provider; email addresses do not.
              </p>
              <AiStatusNote className="mt-1.5" />
            </div>

            {setupError && <Alert>{setupError}</Alert>}
            {setupOk && <Alert tone="ok">{setupOk}</Alert>}
            {configured && sheetButton && <div>{sheetButton}</div>}
            {reconnect === "google" && (setupError || statusError) && reconnectLink}

            <button type="submit" disabled={saving} className="btn-primary">
              {saving && <SpinnerIcon />} {configured ? "Save and re-import" : "Import sheet"}
            </button>
          </form>
        </Card>
      )}

      {/* 3. Sending accounts */}
      {configured && rows.length > 0 && (
        <Card title="Sending accounts" icon={<UsersIcon className="h-5 w-5 text-accent" />}>
          <p className="mb-4 text-sm text-ink-soft">
            Every connected account sends its own share each day. Set how many emails each one may send per day (start low, then raise it over a few weeks).
          </p>
          <ul className="space-y-2.5">
            {rows.map((r, i) => (
              <li key={r.accountId} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-paper px-3.5 py-3">
                <label className="flex min-h-[40px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                    className="h-4 w-4 shrink-0 accent-[#2E5D50]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink" title={r.email}>{r.email}</span>
                    <span className="block text-xs text-ink-soft">
                      {r.provider === "google" ? "Gmail" : "Outlook"} · today {used[r.accountId] ?? 0} of {r.limitText || 0}
                      {r.needsReconnect && <span className="font-medium text-amber"> · needs reconnect</span>}
                    </span>
                  </span>
                </label>
                {r.needsReconnect && (
                  <a href={reconnectHref({ provider: r.provider, sheets_enabled: sheetsAccounts.some((a) => a.id === r.accountId) }, "/automation")} className="btn-primary min-h-[40px] px-3 text-xs">
                    Reconnect
                  </a>
                )}
                <div className="flex items-center gap-2">
                  <label htmlFor={`limit-${r.accountId}`} className="text-xs text-ink-soft">Per day</label>
                  <input
                    id={`limit-${r.accountId}`}
                    type="number"
                    min={0}
                    max={500}
                    value={r.limitText}
                    onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, limitText: e.target.value } : x)))}
                    className="input-sm w-20"
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveSenders} disabled={sendersBusy} className="btn-primary">
              {sendersBusy && <SpinnerIcon />} Save limits
            </button>
            <span aria-live="polite" className={`text-sm ${sendersNote?.ok ? "text-accent-deep" : "text-red-700"}`}>{sendersNote?.text}</span>
          </div>
        </Card>
      )}

      {/* 4. Schedule */}
      {configured && (
        <Card title="Daily schedule" icon={<SparkleIcon className="h-5 w-5 text-accent" />}>
          {sheetButton && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {sheetButton}
              <span className="text-xs text-ink-soft">Addresses emailed today are green in the sheet until the next day&rsquo;s sending starts.</span>
            </div>
          )}
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">
            At the time you choose, Outbox picks the next unsent addresses for every sending account, writes the emails with your prompt, and sends them
            one by one with a pause in between. It uses the prompt from &ldquo;Your sheet&rdquo; above, so change it there.
          </p>

          <div className="grid gap-5 sm:grid-cols-[auto_150px_170px]">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={schedEnabled} onChange={(e) => setSchedEnabled(e.target.checked)} className="h-4 w-4 accent-[#2E5D50]" />
              Run automatically every day
            </label>
            <div>
              <label htmlFor="sched-time" className="mb-1 block text-xs text-ink-soft">Start time</label>
              <input id="sched-time" type="time" required value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="sched-pause" className="mb-1 block text-xs text-ink-soft">Pause between emails (seconds)</label>
              <input id="sched-pause" type="number" min={20} max={900} value={pause} onChange={(e) => setPause(Number(e.target.value))} className="input" />
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            The time is in your timezone ({typeof window === "undefined" ? "" : timezone()}). The pause is per sending account and varies a little so it looks natural.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => scheduleAction("save")} disabled={schedBusy !== null} className="btn-primary">
              {schedBusy === "save" && <SpinnerIcon />} Save schedule
            </button>
            {savedEnabled && (
              <>
                <button type="button" onClick={() => scheduleAction("run")} disabled={schedBusy !== null} className="btn-secondary">
                  {schedBusy === "run" && <SpinnerIcon />} Run today&rsquo;s schedule now
                </button>
                <button type="button" onClick={() => scheduleAction("cancel")} disabled={schedBusy !== null} className="btn-ghost">
                  Cancel waiting emails
                </button>
              </>
            )}
          </div>

          <div aria-live="polite" className="mt-4 space-y-3">
            {schedNote && <Alert tone={schedNote.ok ? "ok" : "error"}>{schedNote.text}</Alert>}
            {schedError && <Alert>Last run problem: {schedError}</Alert>}
          </div>

          {queue && queue.queued > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              Today: <strong className="text-ink">{queue.sent}</strong> sent, <strong className="text-ink">{queue.pending}</strong> waiting,{" "}
              {queue.failed} failed
              {queue.nextAt && queue.pending > 0 && <> · next at <LocalTime iso={queue.nextAt} /></>}
            </p>
          )}

          {background.active ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-soft px-3.5 py-3 text-xs leading-relaxed text-accent-deep">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
              Background runs are on: the server checks every few minutes, so the schedule keeps running even when your computer is off.
            </p>
          ) : (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-3 text-xs leading-relaxed text-amber">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Background runs are not set up yet, so the schedule only runs while this page is open.{" "}
                {background.isAdmin ? (
                  <a href="/admin/scheduler" className="font-medium underline underline-offset-2">Set it up (one time)</a>
                ) : (
                  "Ask the site admin to turn them on."
                )}
              </span>
            </p>
          )}
        </Card>
      )}

      {/* 5. Button batch */}
      {configured && (
        <Card title="Send a batch now" icon={<SendIcon className="h-5 w-5 text-accent" />}>
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
          {tabTitle && <p className="mb-4 text-sm text-ink-soft">Tab: <span className="text-ink">{tabTitle}</span></p>}

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
            {reconnect === "google" && !setupError && !statusError && (
              <div className="space-y-2">
                {reconnectLink}
                <p className="text-xs text-ink-soft">Your prepared emails are saved. After reconnecting you can send them without writing them again.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 6. Review and send */}
      {batch.length > 0 && (
        <Card title={phase === "done" ? "Results" : "Review and send"} icon={<SendIcon className="h-5 w-5 text-accent" />}>
          {phase === "done" && (
            <div className="mb-4 space-y-3">
              <Alert tone={failedCount > 0 ? "error" : "ok"}>
                Sent {sentCount}
                {failedCount > 0 ? `, ${failedCount} failed (they stay unmarked and come back next time)` : ""}. The sheet was updated.
              </Alert>
              {sheetButton && (
                <div className="flex flex-wrap items-center gap-3">
                  {sheetButton}
                  <span className="text-xs text-ink-soft">Today&rsquo;s sent emails are green in the sheet until the next day&rsquo;s batch starts sending.</span>
                </div>
              )}
              {tickFailed && <Alert>The emails went out, but the sheet couldn&rsquo;t be updated. It will be done automatically next time you prepare a batch.</Alert>}
            </div>
          )}
          {draftNote && phase === "review" && <p className="mb-3 text-xs text-accent-deep">Saved batch restored (from {draftNote}). Nothing had to be written again.</p>}
          {phase === "review" && <p className="mb-4 text-sm text-ink-soft">Check the subjects and messages. Edit anything, or tick &ldquo;Skip&rdquo; to leave an address for another day.</p>}

          <ul className="max-h-[640px] space-y-3 overflow-y-auto rounded-xl border border-line bg-paper p-3">
            {batch.map((b) => (
              <li key={`${b.row}-${b.email}`} className={`rounded-lg border border-line bg-white p-3 ${b.skip ? "opacity-60" : ""}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-ink-soft">
                    <span className="font-medium text-ink">{b.website ?? "no website"}</span> · {b.email} · row {b.row}
                    {b.fromEmail && <> · from {b.fromEmail}</>}
                  </p>
                  {b.status ? (
                    <span className={`pill ${b.status === "sent" ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {b.status === "sent" ? "Sent" : "Failed"}
                    </span>
                  ) : (
                    <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-ink-soft">
                      <input type="checkbox" checked={b.skip} disabled={phase !== "review"} onChange={(e) => update(b.row, b.email, { skip: e.target.checked })} className="h-4 w-4 accent-[#2E5D50]" />
                      Skip
                    </label>
                  )}
                </div>
                <input aria-label={`Subject for ${b.email}`} value={b.subject} disabled={phase !== "review" || b.status === "sent"} onChange={(e) => update(b.row, b.email, { subject: e.target.value })} className="input-sm mb-2" />
                <textarea aria-label={`Message for ${b.email}`} rows={5} value={b.body} disabled={phase !== "review" || b.status === "sent"} onChange={(e) => update(b.row, b.email, { body: e.target.value })} className="input-sm resize-y" />
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
