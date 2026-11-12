"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SendLog from "@/components/automation/SendLog";
import PresetPicker from "@/components/PresetPicker";
import AiStatusNote from "@/components/AiStatusNote";
import { useToast } from "@/components/Toaster";
import { useConfirmAction } from "@/components/ConfirmAction";
import LocalTime from "@/components/LocalTime";
import { reconnectHref } from "@/lib/reconnect";
import { useScrollLock } from "@/components/useScrollLock";
import type { AiPreset } from "@/content/ai-presets";
import { AlertIcon, CheckIcon, ChevronDownIcon, PlusIcon, SheetIcon, ShieldIcon, SparkleIcon, SendIcon, SpinnerIcon, UsersIcon, XIcon } from "@/components/icons";

export type GoogleAccount = { id: string; email: string; sheets_enabled: boolean };
export type SenderView = { accountId: string; email: string; provider: "google" | "microsoft"; limit: number; enabled: boolean; needsReconnect: boolean };
export type SettingsView = {
  id: string;
  account_id: string | null;
  spreadsheet_id: string;
  sheet_title: string;
  website_col: string;
  email_col: string;
  sent_col: string;
  filter_col: string | null;
  filter_value: string | null;
  extra_cols?: { col: string; header: string }[];
  prompt: string;
  ai_notes?: string;
  auto_follow_up_ai_notes?: string;
  auto_follow_up?: boolean;
  follow_up_after_days?: number;
  max_follow_ups?: number;
  schedule_enabled: boolean;
  send_saturday?: boolean;
  schedule_time: string;
  pause_seconds: number;
};

type Stats = { total: number; websites: number; sent: number; pending: number };
type QueueInfo = { queued: number; pending: number; sent: number; failed: number; nextAt: string | null };
type BatchItem = {
  row: number;
  website: string | null;
  fields?: Record<string, string>; // values of the extra columns for this row
  email: string;
  accountId: string;
  fromEmail: string;
  subject: string;
  body: string;
  skip: boolean;
  status?: "sent" | "failed";
};
type ExtraCol = { col: string; header: string };
const MAX_EXTRA_COLUMNS = 8;
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
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-accent/20 bg-accent-soft text-accent-deep"
        }`}
    >
      {tone === "error" ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

export default function AutomationPanel({
  accounts,
  settingsList: initialSettings,
  sendersByAutomation,
  defaultSenders,
  multipleSheetsReady,
  presets,
  background,
}: {
  accounts: GoogleAccount[];
  settingsList: SettingsView[];
  sendersByAutomation: Record<string, SenderView[]>;
  defaultSenders: SenderView[];
  multipleSheetsReady: boolean;
  presets: AiPreset[];
  background: { active: boolean; isAdmin: boolean };
}) {
  const router = useRouter();
  const [settingsList, setSettingsList] = useState(initialSettings);
  const [senderOverrides, setSenderOverrides] = useState<Record<string, SenderView[]>>({});
  const [selection, setSelection] = useState<
    | { kind: "sheet"; id: string }
    | { kind: "new"; returnId: string }
  >(initialSettings[0] ? { kind: "sheet", id: initialSettings[0].id } : { kind: "new", returnId: "" });
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const adding = selection.kind === "new";
  const selectedId = selection.kind === "sheet" ? selection.id : selection.returnId;
  const current = settingsList.find((s) => s.id === selectedId) ?? null;
  const addingAnother = adding && Boolean(selection.returnId);

  useEffect(() => {
    setMounted(true);
  }, []);
  useScrollLock(addingAnother);
  useEffect(() => {
    if (!addingAnother) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection({ kind: "sheet", id: selection.returnId });
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [addingAnother, selection]);

  function configured(next: SettingsView, nextSenders?: SenderView[]) {
    setSettingsList((list) => list.some((s) => s.id === next.id) ? list.map((s) => s.id === next.id ? next : s) : [...list, next]);
    if (nextSenders) setSenderOverrides((current) => ({ ...current, [next.id]: nextSenders }));
    setSettingsOpen(false);
    setSelection({ kind: "sheet", id: next.id });
    router.refresh();
  }

  function removed(id: string) {
    const remaining = settingsList.filter((sheet) => sheet.id !== id);
    setSettingsList(remaining);
    setSenderOverrides((saved) => Object.fromEntries(Object.entries(saved).filter(([key]) => key !== id)));
    setSettingsOpen(false);
    setSelection(remaining[0] ? { kind: "sheet", id: remaining[0].id } : { kind: "new", returnId: "" });
    router.refresh();
  }

  function cancelAdding() {
    if (selection.kind === "new" && selection.returnId) {
      setSettingsOpen(false);
      setSelection({ kind: "sheet", id: selection.returnId });
    }
  }

  // Construct one editor and place that same element either in the page or in the add-sheet dialog.
  const editor = (multipleSheetsReady || adding || !current) ? (
    <AutomationPanelEditor
      key={adding ? "new-sheet" : selectedId}
      accounts={accounts}
      settings={adding ? null : current}
      senders={current ? (senderOverrides[current.id] ?? sendersByAutomation[current.id] ?? defaultSenders) : defaultSenders}
      availableSenders={defaultSenders}
      presets={presets}
      background={background}
      automationId={adding ? null : selectedId}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onConfigured={configured}
      onRemoved={removed}
      onSendersSaved={(nextSenders) => {
        if (current) setSenderOverrides((saved) => ({ ...saved, [current.id]: nextSenders }));
      }}
    />
  ) : null;

  const editorView = addingAnother
    ? mounted && editor ? createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-sheet-dialog-title"
        onMouseDown={(event) => { if (event.target === event.currentTarget) cancelAdding(); }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3 sm:p-8"
      >
        <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-line bg-paper text-ink shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-accent-deep">New workflow</p><h2 id="new-sheet-dialog-title" className="mt-1 font-serif text-xl">Link another sheet</h2></div>
            <button type="button" autoFocus onClick={cancelAdding} className="btn-secondary min-h-10 px-3 text-sm">Cancel</button>
          </div>
          <div className="p-4 sm:p-7">{editor}</div>
        </section>
      </div>,
      document.body
    ) : null
    : editor;

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-3 p-4 sm:px-6 sm:py-5">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Workflow</span>
        <label className="min-w-[240px] flex-1">
          <span className="sr-only">Linked sheet workflow</span>
          <select className="input min-h-12 text-base font-medium" value={adding ? "__new__" : selectedId} onChange={(e) => {
            if (e.target.value === "__new__") setSelection({ kind: "new", returnId: selectedId });
            else { setSettingsOpen(false); setSelection({ kind: "sheet", id: e.target.value }); }
          }}>
            {settingsList.map((s) => <option key={s.id} value={s.id}>
              {s.sheet_title} ·
              {/* {s.spreadsheet_id.slice(-5)} · */}
              {s.schedule_enabled ? "Scheduled" : "Manual"}</option>)}
            <option value="__new__" disabled={!multipleSheetsReady}>Link another sheet…</option>
          </select>
        </label>
        {!adding && current && <span className="px-1 text-sm text-ink-soft">Tab: {current.sheet_title}</span>}
        {!adding && current && <button type="button" className="btn-secondary min-h-12 px-5" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>Sheet settings</button>}
        {!adding && current && <a href={`https://docs.google.com/spreadsheets/d/${current.spreadsheet_id}/edit`} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-12 px-5"><SheetIcon className="h-4 w-4" /> Open sheet</a>}
        {!adding && <button type="button" disabled={!multipleSheetsReady} className="btn-secondary min-h-12 px-5" onClick={() => setSelection({ kind: "new", returnId: selectedId })}>Link another sheet</button>}
      </section>
      {editorView}
    </div>
  );
}

function AutomationPanelEditor({
  accounts,
  settings,
  senders,
  availableSenders,
  presets,
  background,
  automationId,
  settingsOpen,
  onSettingsOpenChange,
  onConfigured,
  onRemoved,
  onSendersSaved,
}: {
  accounts: GoogleAccount[];
  settings: SettingsView | null;
  senders: SenderView[];
  availableSenders: SenderView[];
  presets: AiPreset[];
  automationId: string | null;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onConfigured: (settings: SettingsView, senders?: SenderView[]) => void;
  onRemoved: (id: string) => void;
  onSendersSaved: (senders: SenderView[]) => void;
  /** Whether the server-side scheduler is calling the app, so runs continue with this page closed. */
  background: { active: boolean; isAdmin: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const { askToConfirm, confirmationDialog } = useConfirmAction();

  function addExtraColumn() {
    const col = newCol.trim().toUpperCase();
    const header = newHeader.replace(/\s+/g, " ").trim();
    if (!/^[A-Z]$/.test(col)) return setExtraError("Type the column letter, one letter from A to Z.");
    if (!header) return setExtraError("Type the header of that column. You will use this name in your instructions.");
    if (header.toLowerCase() === "website") return setExtraError('"Website" is already used for the domain column. Pick another header.');
    if ([cols.website, cols.email, cols.sent].includes(col)) return setExtraError(`Column ${col} is already used for the domain, emails or sent marks.`);
    if (extraCols.some((e) => e.col === col)) return setExtraError(`Column ${col} is already added.`);
    if (extraCols.some((e) => e.header.toLowerCase() === header.toLowerCase())) return setExtraError(`There is already a column called "${header}".`);
    if (extraCols.length >= MAX_EXTRA_COLUMNS) return setExtraError(`You can add up to ${MAX_EXTRA_COLUMNS} extra columns.`);
    setExtraCols((list) => [...list, { col, header: header.slice(0, 40) }]);
    setNewCol("");
    setNewHeader("");
    setExtraError(null);
    setAddOpen(false);
  }
  const sheetsAccounts = accounts.filter((a) => a.sheets_enabled);

  // ---- sheet setup ----
  const [accountId, setAccountId] = useState(settings?.account_id ?? sheetsAccounts[0]?.id ?? "");
  const [sheetLink, setSheetLink] = useState(settings ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : "");
  const [sheetUrl, setSheetUrl] = useState(settings ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : "");
  const [cols, setCols] = useState({ website: settings?.website_col ?? "B", email: settings?.email_col ?? "E", sent: settings?.sent_col ?? "F" });
  const [filter, setFilter] = useState({ col: settings ? settings.filter_col ?? "" : "D", value: settings ? settings.filter_value ?? "" : "" });
  const [prompt, setPrompt] = useState(settings?.prompt ?? "");
  const [aiNotes, setAiNotes] = useState(settings?.ai_notes ?? "");
  const [autoFollowUpAiNotes, setAutoFollowUpAiNotes] = useState(settings?.auto_follow_up_ai_notes ?? "");
  const [autoFollowUp, setAutoFollowUp] = useState(settings?.auto_follow_up ?? false);
  const [followUpOpen, setFollowUpOpen] = useState(settings?.auto_follow_up ?? false);
  const [followUpAfterDays, setFollowUpAfterDays] = useState(settings?.follow_up_after_days ?? 4);
  const [maxFollowUps, setMaxFollowUps] = useState(settings?.max_follow_ups ?? 2);
  // Optional extra sheet columns: their values are given to the AI, so the prompt can use them by header.
  const [extraCols, setExtraCols] = useState<ExtraCol[]>(settings?.extra_cols ?? []);
  const [savedExtra, setSavedExtra] = useState(JSON.stringify(settings?.extra_cols ?? []));
  const [addOpen, setAddOpen] = useState(false);
  const [newCol, setNewCol] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const [extraError, setExtraError] = useState<string | null>(null);
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
  const [rows, setRows] = useState(settings ? senders.map((s) => ({ ...s, limitText: String(s.limit) })) : []);
  const [addAccountId, setAddAccountId] = useState("");
  const [sendersBusy, setSendersBusy] = useState(false);
  const [sendersNote, setSendersNote] = useState<{ ok: boolean; text: string } | null>(null);
  const availableToAdd = availableSenders.filter((account) => !rows.some((row) => row.accountId === account.accountId));

  function addSender() {
    const account = availableToAdd.find((candidate) => candidate.accountId === addAccountId);
    if (!account) return;
    setRows((current) => [...current, { ...account, enabled: true, limitText: String(account.limit) }]);
    setAddAccountId("");
    setSendersNote(null);
  }

  // ---- schedule ----
  const [schedEnabled, setSchedEnabled] = useState(settings?.schedule_enabled ?? false);
  const [sendSaturday, setSendSaturday] = useState(settings?.send_saturday ?? false);
  const [savedEnabled, setSavedEnabled] = useState(settings?.schedule_enabled ?? false);
  const [schedTime, setSchedTime] = useState(settings?.schedule_time ?? "10:00");
  const [pause, setPause] = useState(settings?.pause_seconds ?? 90);
  const [timezoneName, setTimezoneName] = useState("");
  const [schedBusy, setSchedBusy] = useState<"save" | "run" | "cancel" | null>(null);
  const [schedNote, setSchedNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [schedInfo, setSchedInfo] = useState<string | null>(null);

  // ---- manual batch ----
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickFailed, setTickFailed] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setTimezoneName(timezone());
  }, []);

  async function sheetApi(url: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: unknown) {
    if (!url.startsWith("/api/automation/")) return api(url, method, body);
    if (method === "GET" || method === "DELETE") {
      // A new-sheet editor has no workflow ID yet. Never let its requests
      // fall through to the API's legacy "first workflow" default.
      if (!automationId) return { configured: false };
      url += `${url.includes("?") ? "&" : "?"}automationId=${encodeURIComponent(automationId)}`;
      return api(url, method);
    }
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    if (!automationId && url !== "/api/automation/settings") return { configured: false };
    return api(url, method, { ...payload, ...(automationId ? { automationId } : {}) });
  }

  async function refreshStatus() {
    if (!settings || !automationId) return;
    try {
      const data = await sheetApi("/api/automation/status", "GET");
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
    if (!settings || !automationId) return;
    try {
      const data = await sheetApi("/api/automation/schedule", "GET");
      if (data.configured) {
        setQueue(data.queue);
        setSchedError(data.error ?? null);
        setSchedInfo(data.note ?? null);
      }
    } catch {
      // keep what is shown
    }
  }

  async function saveDraft(items: BatchItem[]) {
    try {
      await sheetApi("/api/automation/draft", "PUT", { items });
    } catch {
      // best effort
    }
  }
  async function deleteDraft() {
    try {
      await sheetApi("/api/automation/draft", "DELETE");
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
        const data = await sheetApi("/api/automation/draft", "GET");
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
    if (!configured || !automationId) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        await sheetApi("/api/automation/tick");
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
    if (rows.length === 0) {
      setSetupError("Add at least one sending account for this sheet.");
      return;
    }
    setSaving(true);
    setSetupError(null);
    setSetupOk(null);
    setReconnect(null);
    try {
      const data = await sheetApi("/api/automation/settings", "POST", {
        accountId,
        sheetUrl,
        websiteCol: cols.website,
        emailCol: cols.email,
        sentCol: cols.sent,
        filterCol: filter.col,
        filterValue: filter.value,
        extraCols,
        prompt,
        aiNotes,
        autoFollowUp,
        followUpAfterDays,
        maxFollowUps,
        timezone: timezone(),
      });
      if (typeof data.settings?.id === "string") {
        await api("/api/automation/senders", "POST", {
          automationId: data.settings.id,
          senders: rows.map((r) => ({ accountId: r.accountId, enabled: r.enabled, limit: Number(r.limitText) })),
        });
      } else {
        throw new Error("Run the multiple automations database migration before choosing sending accounts for this sheet.");
      }
      setConfigured(true);
      setSavedExtra(JSON.stringify(extraCols));
      setTabTitle(data.sheetTitle);
      setSheetLink(sheetUrl);
      setStats(data.stats);
      setStatusError(null);
      setSetupOk(`Imported "${data.sheetTitle}". ${data.stats.pending} email${data.stats.pending === 1 ? "" : "s"} still to send.`);
      toast.success(`Sheet imported. ${data.stats.pending} email${data.stats.pending === 1 ? "" : "s"} still to send.`);
      onConfigured(data.settings as SettingsView, rows.map((r) => ({ ...r, limit: Number(r.limitText) })));
      void refreshStatus();
    } catch (err) {
      setSetupError(message(err, "Could not import the sheet."));
      toast.error(message(err, "Could not import the sheet."));
      setReconnect(reconnectOf(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmRemoveSheet() {
    if (!settings || !automationId || automationId.startsWith("legacy:")) return;
    askToConfirm({
      title: `Remove "${settings.sheet_title}"?`,
      description: "This removes the sheet from automation and cancels its waiting emails. Sent history will be kept.",
      confirmLabel: "Remove sheet",
      action: async () => {
        await api(`/api/automation/settings?automationId=${encodeURIComponent(automationId)}`, "DELETE");
        toast.success("Sheet removed from automation.");
        onRemoved(automationId);
      },
    });
  }

  async function saveSenders() {
    setSendersBusy(true);
    setSendersNote(null);
    try {
      await sheetApi("/api/automation/senders", "POST", {
        senders: rows.map((r) => ({ accountId: r.accountId, enabled: r.enabled, limit: Number(r.limitText) })),
      });
      onSendersSaved(rows.map((r) => ({ ...r, limit: Number(r.limitText) })));
      router.refresh();
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
        await sheetApi("/api/automation/schedule", "POST", { action: "save", enabled: schedEnabled, time: schedTime, pauseSeconds: pause, timezone: timezone(), sendSaturday, autoFollowUp, followUpAfterDays, maxFollowUps, autoFollowUpAiNotes });
        setSavedEnabled(schedEnabled);
        const days = sendSaturday ? "Monday to Saturday" : "Monday to Friday";
        setSchedNote({ ok: true, text: schedEnabled ? `Schedule saved. It runs ${days} at ${schedTime}.` : "Schedule turned off." });
        toast.success(schedEnabled ? `Schedule saved. It runs ${days} at ${schedTime}.` : "Schedule turned off.");
      } else if (action === "run") {
        const data = await sheetApi("/api/automation/schedule", "POST", { action: "run-now" });
        const noWork = typeof data.note === "string" && /^(No unsent addresses|All unsent addresses|No sending accounts|All assigned sending accounts|No assigned sending accounts|All enabled sending accounts)/.test(data.note);
        setSchedNote({ ok: !data.note || noWork, text: data.note ?? `Queued ${data.prepared} email${data.prepared === 1 ? "" : "s"}. They are sent with pauses of about ${pause} seconds per account.` });
        if (data.note) toast.info(data.note);
        else toast.success(`Queued ${data.prepared} email${data.prepared === 1 ? "" : "s"}. They are sent with pauses between them.`);
      } else {
        await sheetApi("/api/automation/schedule", "POST", { action: "cancel" });
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
      const next = await sheetApi("/api/automation/next");
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
          const data = await api("/api/ai/email", "POST", { prompt: next.prompt, notes: next.aiNotes, count: chunk.length, contexts: chunk.map((c) => ({ website: c.website ?? null, fields: c.fields ?? {} })) });
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
        const data = await sheetApi("/api/automation/send", "POST", {
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
  const dailyLimit = rows.reduce((sum, row) => sum + (row.enabled ? Math.max(0, Number(row.limitText) || 0) : 0), 0);
  const sentToday = Object.values(used).reduce((sum, value) => sum + value, 0);
  const sentPercent = stats && stats.total > 0 ? Math.min(100, (stats.sent / stats.total) * 100) : 0;
  const estimatedDays = stats && dailyLimit > 0 ? Math.ceil(stats.pending / dailyLimit) : null;
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
    <div className="space-y-5">
      {confirmationDialog}
      {/* 1. Google Sheets access */}
      {!configured && <div>
        <Card title="Google Sheets access" icon={<ShieldIcon className="h-5 w-5 text-accent" />}>
          {accounts.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Connect a Gmail account on the <a href="/compose" className="text-accent-deep underline underline-offset-2">Compose</a> page first.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">
                Outbox needs permission to read your sheet and to mark each address once it has been emailed. Google words this permission as
                access to your spreadsheets, but Outbox only opens the sheets you link here.
              </p>
              {sheetsAccounts.length > 0 && <p className="mt-3 text-sm text-accent-deep">Enabled for: {sheetsAccounts.map((a) => a.email).join(", ")}</p>}
              <a href="/oauth/google?sheets=1" className="btn-secondary mt-4">
                <SheetIcon className="h-4 w-4 text-accent" />
                {sheetsAccounts.length > 0 ? "Enable for another Gmail account" : "Enable Google Sheets"}
              </a>
            </>
          )}
        </Card>
      </div>}

      {/* 2. Sheet + prompt */}
      {sheetsAccounts.length > 0 && (
        <details className="card overflow-hidden" open={!configured || settingsOpen} onToggle={(event) => {
          if (configured) onSettingsOpenChange(event.currentTarget.open);
        }}>
          <summary className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 ${configured ? "hidden" : ""}`}>
            <span className="font-serif text-xl text-ink">{configured ? `Sheet settings · ${tabTitle || "linked sheet"}` : "Set up a linked sheet"}</span>
            <span className="text-xs font-medium text-accent-deep">{configured ? "Edit" : "Setup"}</span>
          </summary>
          <div className="border-t border-line p-5 sm:p-6">
            <div className="space-y-5">
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

                <fieldset className="rounded-xl border border-line p-4">
                  <legend className="label px-1">Accounts that send from this sheet</legend>
                  <p className="mb-3 text-sm text-ink-soft">Only accounts added here will be available to this workflow.</p>
                  <div className="flex flex-wrap gap-2">
                    <select aria-label="Choose a sending account to add" value={addAccountId} onChange={(event) => setAddAccountId(event.target.value)} className="input min-w-[220px] flex-1">
                      <option value="">Choose an account</option>
                      {availableToAdd.map((account) => <option key={account.accountId} value={account.accountId}>{account.email}</option>)}
                    </select>
                    <button type="button" onClick={addSender} disabled={!addAccountId} className="btn-secondary min-h-11 px-4" aria-label="Add account to this sheet">
                      <PlusIcon className="h-4 w-4" /> Add account
                    </button>
                  </div>
                  {rows.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {rows.map((r) => (
                        <li key={r.accountId} className="flex items-center gap-3 rounded-lg bg-mist px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.email}</span>
                          <span className="shrink-0 text-xs text-ink-soft">{r.provider === "google" ? "Gmail" : "Outlook"}</span>
                          <button type="button" onClick={() => askToConfirm({ title: `Remove ${r.email} from this sheet?`, description: "This account will not be included when you import the sheet.", confirmLabel: "Remove account", action: () => setRows((current) => current.filter((item) => item.accountId !== r.accountId)) })} className="btn-ghost min-h-8 px-2 text-red-700" aria-label={`Remove ${r.email} from this sheet`}>
                            <XIcon className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">No sending accounts added yet.</p>
                  )}
                </fieldset>

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

                  <div className="mt-4 rounded-xl border border-line p-3.5">
                    <p className="text-sm font-medium text-ink">
                      Extra columns <span className="font-normal text-ink-soft">(optional)</span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      Want the AI to use more of your sheet, such as the owner&rsquo;s name or the niche? Add that column here with a header, then use the header in your instructions.
                    </p>

                    {extraCols.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {extraCols.map((e) => (
                          <li key={e.col} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white text-xs font-semibold text-ink">{e.col}</span>
                            <span className="min-w-0 flex-1 truncate text-ink">{e.header}</span>
                            <button type="button" onClick={() => askToConfirm({ title: "Remove column?", description: "This removes the extra column from this workflow email instructions. Save the workflow to apply the change.", confirmLabel: "Remove column", action: () => setExtraCols((list) => list.filter((x) => x.col !== e.col)) })} className="text-xs font-medium text-red-700 underline underline-offset-2">
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {addOpen ? (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-[80px_1fr] gap-3">
                          <div>
                            <label htmlFor="extra-col" className="mb-1 block text-xs text-ink-soft">Column letter</label>
                            <input
                              id="extra-col"
                              maxLength={1}
                              value={newCol}
                              onChange={(e) => setNewCol(e.target.value.toUpperCase())}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtraColumn())}
                              className="input text-center uppercase"
                              placeholder="F"
                            />
                          </div>
                          <div>
                            <label htmlFor="extra-header" className="mb-1 block text-xs text-ink-soft">Header (the name you will use in your instructions)</label>
                            <input
                              id="extra-header"
                              maxLength={40}
                              value={newHeader}
                              onChange={(e) => setNewHeader(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtraColumn())}
                              className="input"
                              placeholder="Owner name"
                            />
                          </div>
                        </div>
                        {extraError && <p role="alert" className="text-xs text-red-700">{extraError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={addExtraColumn} className="btn-primary min-h-[36px] px-3.5 text-xs">
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddOpen(false);
                              setExtraError(null);
                            }}
                            className="btn-ghost min-h-[36px] px-3 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAddOpen(true)} disabled={extraCols.length >= MAX_EXTRA_COLUMNS} className="btn-secondary mt-3 min-h-[36px] px-3 text-xs">
                        + Add column
                      </button>
                    )}

                    {JSON.stringify(extraCols) !== savedExtra && (
                      <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber">Not saved yet. Press &ldquo;{configured ? "Save and re-import" : "Import sheet"}&rdquo; below to apply your columns.</p>
                    )}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="ai-instructions" className="label">What should every email say?</label>
                  <PresetPicker presets={presets} value={prompt} onPick={setPrompt} />
                  <textarea
                    id="ai-instructions"
                    required
                    rows={7}
                    minLength={10}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Pick a preset above or describe the email. The AI writes a different subject (mentioning the website) and message for every address."
                    className="input resize-y"
                  />
                  <div className="mt-4">
                    <label htmlFor="automation-ai-notes" className="label">AI notes for this sheet (optional)</label>
                    <textarea
                      id="automation-ai-notes"
                      rows={4}
                      maxLength={2000}
                      value={aiNotes}
                      onChange={(event) => setAiNotes(event.target.value)}
                      placeholder="Add background for the initial emails, such as what you offer, useful facts, or your preferred tone."
                      className="input resize-y"
                    />
                    <p className="mt-1.5 text-xs text-ink-soft">Used for initial emails sent from this sheet, in both prepared batches and the daily schedule. Automatic follow-ups have their own notes below. Up to 2,000 characters.</p>
                  </div>
                  {extraCols.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-ink-soft">Details from your sheet you can use in the instructions (click to add):</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {extraCols.map((e) => (
                          <button
                            key={e.col}
                            type="button"
                            onClick={() => setPrompt((p) => `${p}${p && !/\s$/.test(p) ? " " : ""}{${e.header}}`)}
                            className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-mist"
                          >
                            {`{${e.header}}`}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-ink-soft">For example: &ldquo;Greet them by {`{${extraCols[0].header}}`}.&rdquo; If a row has nothing in that column, the AI leaves it out for that row.</p>
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-ink-soft">
                    These instructions and notes are used for button batches and the daily schedule. They, each recipient&rsquo;s website and the extra columns you add go to an AI provider; email addresses do not.
                  </p>
                  <AiStatusNote className="mt-1.5" />
                </div>

                {setupError && <Alert>{setupError}</Alert>}
                {setupOk && <Alert tone="ok">{setupOk}</Alert>}
                {reconnect === "google" && (setupError || statusError) && reconnectLink}

                <button type="submit" disabled={saving} className="btn-primary">
                  {saving && <SpinnerIcon />} {configured ? "Save and re-import" : "Import sheet"}
                </button>
              </form>
              {configured && settings && (
                <div className="flex justify-end border-t border-line pt-4">
                  <button type="button" onClick={confirmRemoveSheet} disabled={!automationId || automationId.startsWith("legacy:") || busy || saving} className="btn-ghost min-h-10 px-3 text-sm text-red-700">
                    Remove sheet from automation
                  </button>
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      {/* 3. Sending accounts */}
      {configured && (
        <section className="card p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-soft">Still to send</p>
              <p className="font-serif text-6xl leading-none tracking-tight text-ink">{stats?.pending.toLocaleString() ?? "…"}</p>
            </div>
            <p className="pb-1 text-right text-sm text-ink-soft">
              {dailyLimit > 0 ? `At ${dailyLimit} per day, about ${estimatedDays ?? "…"} sending days left` : "Set a daily limit to estimate sending time"}
            </p>
          </div>
          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label="Sheet email progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sentPercent)}>
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${sentPercent}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><p className="font-serif text-2xl text-ink">{stats?.total.toLocaleString() ?? "…"}</p><p className="text-sm text-ink-soft">In sheet</p></div>
            <div><p className="font-serif text-2xl text-ink">{stats?.websites.toLocaleString() ?? "…"}</p><p className="text-sm text-ink-soft">Websites</p></div>
            <div><p className="font-serif text-2xl text-ink">{stats?.sent.toLocaleString() ?? "…"}</p><p className="text-sm text-ink-soft">Already sent ({Math.round(sentPercent)}%)</p></div>
            <div><p className="font-serif text-2xl text-ink">{sentToday.toLocaleString()}</p><p className="text-sm text-ink-soft">Sent today</p></div>
          </div>
        </section>
      )}

      {configured && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title="Sending accounts" icon={<UsersIcon className="h-5 w-5 text-accent" />}>
            <p className="mb-4 border-b border-line pb-4 text-sm text-ink-soft">
              Add or remove accounts from this sheet. Keep an account checked to include it in automation; uncheck it to pause it temporarily. Set a daily limit for each account.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <select aria-label="Choose a sending account to add" value={addAccountId} onChange={(event) => setAddAccountId(event.target.value)} className="input min-w-[220px] flex-1">
                <option value="">Choose an account to add</option>
                {availableToAdd.map((account) => <option key={account.accountId} value={account.accountId}>{account.email}</option>)}
              </select>
              <button type="button" onClick={addSender} disabled={!addAccountId} className="btn-secondary min-h-11 px-4">
                <PlusIcon className="h-4 w-4" /> Add account
              </button>
            </div>
            {rows.length > 0 ? <ul className="space-y-2.5">
              {rows.map((r, i) => (
                <li key={r.accountId} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-0 py-3 last:border-b-0">
                  <label className="flex min-h-[40px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                      aria-label={`Enable ${r.email} for automation on this sheet`}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink" title={r.email}>{r.email}</span>
                      <span className="block text-xs text-ink-soft">
                        {r.provider === "google" ? "Gmail" : "Outlook"} · {r.enabled ? "Available for automation" : "Temporarily paused"} · today {used[r.accountId] ?? 0} of {r.limitText || 0}
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
                      className="input-sm w-[72px] rounded-xl bg-surface px-3 py-3 text-right text-base"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => askToConfirm({
                      title: `Remove ${r.email} from this sheet?`,
                      description: "This account will be removed from the workflow after you save. Its waiting emails will be cancelled; an email already being sent may finish.",
                      confirmLabel: "Remove account",
                      action: () => setRows((current) => current.filter((item) => item.accountId !== r.accountId)),
                    })}
                    className="btn-ghost min-h-10 px-2 text-red-700"
                    aria-label={`Remove ${r.email} from this sheet`}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul> : <p className="rounded-lg bg-mist px-3 py-4 text-sm text-ink-soft">No sending accounts are assigned to this sheet yet.</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="font-medium text-ink">Total: {dailyLimit} per day</span>
              <span aria-live="polite" className={`text-sm ${sendersNote?.ok ? "text-accent-deep" : "text-red-700"}`}>{sendersNote?.text}</span>
              <button type="button" onClick={saveSenders} disabled={sendersBusy} className="btn-secondary">
                {sendersBusy && <SpinnerIcon />} Save
              </button>
            </div>
          </Card>

          {/* 4. Schedule */}
          <Card title="Daily schedule" icon={<SparkleIcon className="h-5 w-5 text-accent" />}>
            <p className="mb-5 text-sm leading-relaxed text-ink-soft">
              At the chosen time, Outbox picks the next unsent addresses, writes each email from your prompt, and sends them one by one with a pause between.
            </p>

            <div className="space-y-4">
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-base text-ink">
                <input type="checkbox" checked={schedEnabled} onChange={(e) => setSchedEnabled(e.target.checked)} className="h-4 w-4 accent-accent" />
                Run automatically every day
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-base text-ink">
                <input type="checkbox" checked={sendSaturday} onChange={(e) => setSendSaturday(e.target.checked)} className="h-4 w-4 accent-accent" />
                Also send on Saturday
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="sched-time" className="mb-1.5 block text-sm text-ink-soft">Start time</label>
                <input id="sched-time" type="time" required value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="sched-pause" className="mb-1.5 block text-sm text-ink-soft">Pause between emails (sec)</label>
                <input id="sched-pause" type="number" min={20} max={900} value={pause} onChange={(e) => setPause(Number(e.target.value))} className="input" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-snug text-ink-soft">
              Sunday is always skipped. Times use {timezoneName || "your local timezone"}. The pause is per account and varies slightly.
            </p>

            <div className="mt-5 border-y border-line">
              <button type="button" aria-expanded={followUpOpen} onClick={() => setFollowUpOpen((open) => !open)} className="flex min-h-12 w-full items-center gap-3 text-left text-sm font-semibold text-ink">
                <span className="shrink-0">Follow Automation</span>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
                <ChevronDownIcon className={`h-4 w-4 shrink-0 transition-transform ${followUpOpen ? "rotate-180" : ""}`} />
              </button>
              {followUpOpen && <div className="space-y-3 pb-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                  <input type="checkbox" checked={autoFollowUp} onChange={(event) => setAutoFollowUp(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <span><span className="font-medium">Automatically follow up with people who haven’t replied</span><span className="mt-1 block text-xs leading-relaxed text-ink-soft">This sends follow-ups for this sheet without review. It needs Gmail inbox access and Groq AI access. To write and send follow-ups yourself, use the separate manual settings in Settings → Inbox.</span></span>
                </label>
                {autoFollowUp && <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink">Wait between follow-ups
                    <span className="mt-1 flex items-center gap-2"><input type="number" min={1} max={30} value={followUpAfterDays} onChange={(event) => setFollowUpAfterDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="input w-24" /><span className="text-xs text-ink-soft">days</span></span>
                  </label>
                  <label className="text-sm text-ink">Maximum follow-ups per person
                    <select value={maxFollowUps} onChange={(event) => setMaxFollowUps(Number(event.target.value))} className="input mt-1">
                      {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                </div>}
                {autoFollowUp && <label className="block text-sm text-ink" htmlFor="auto-follow-up-ai-notes">AI notes for automatic follow-ups
                  <textarea id="auto-follow-up-ai-notes" rows={3} maxLength={2000} value={autoFollowUpAiNotes} onChange={(event) => setAutoFollowUpAiNotes(event.target.value)} placeholder="Guidance for follow-up messages, such as a detail to emphasize, tone, or a polite closing." className="input mt-1 resize-y" />
                  <span className="mt-1 block text-xs leading-relaxed text-ink-soft">These notes apply only to automatic follow-ups for this sheet. Initial emails use the AI notes in sheet settings; manual follow-up drafts use the notes in Settings → Inbox.</span>
                </label>}
              </div>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => scheduleAction("save")} disabled={schedBusy !== null} className="btn-secondary">
                {schedBusy === "save" && <SpinnerIcon />} Save schedule settings
              </button>
              {savedEnabled && (
                <>
                  <button type="button" onClick={() => scheduleAction("run")} disabled={schedBusy !== null} className="btn-secondary">
                    {schedBusy === "run" && <SpinnerIcon />} Run today&rsquo;s schedule now
                  </button>
                  <button type="button" onClick={() => askToConfirm({ title: "Cancel waiting emails?", description: "All emails still waiting in the schedule will be cancelled. Emails already sent will not be affected.", confirmLabel: "Cancel waiting emails", action: () => scheduleAction("cancel") })} disabled={schedBusy !== null} className="btn-ghost">
                    Cancel waiting emails
                  </button>
                </>
              )}
            </div>

            <div aria-live="polite" className="mt-4 space-y-3">
              {schedNote && <Alert tone={schedNote.ok ? "ok" : "error"}>{schedNote.text}</Alert>}
              {schedInfo && <Alert tone="ok">Last run: {schedInfo}</Alert>}
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
        </div>
      )}

      {/* Today's sending log and manual batch action */}
      {configured && automationId && (
        <div className="space-y-3">
          {(statusError || notice || batchError || (reconnect === "google" && !setupError && !statusError)) && (
            <div aria-live="polite" className="space-y-2">
              {statusError && <Alert>{statusError}</Alert>}
              {notice && <Alert tone="ok">{notice}</Alert>}
              {batchError && <Alert>{batchError}</Alert>}
              {reconnect === "google" && !setupError && !statusError && <div className="flex items-center gap-3">{reconnectLink}<span className="text-xs text-ink-soft">Your prepared emails are saved.</span></div>}
            </div>
          )}
          <SendLog
            automationId={automationId}
            title="Today’s sending"
            description="Grouped by sending address. Updates live."
            actions={phase !== "review" && phase !== "sending" ? (
              <button type="button" onClick={prepare} disabled={busy} className="btn-secondary min-h-12 px-5">
                {phase === "preparing" ? <SpinnerIcon /> : <SparkleIcon className="h-4 w-4" />}
                {phase === "preparing"
                  ? progress ? `Writing ${Math.min(progress.done + AI_CHUNK, progress.total)} of ${progress.total}…` : "Reading your sheet…"
                  : phase === "done" ? "Prepare the next batch" : "Prepare today’s batch"}
              </button>
            ) : null}
          />
        </div>
      )}

      {/* 6. Review and send */}
      {batch.length > 0 && (
        <div className="lg:col-span-2">
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
                        <input type="checkbox" checked={b.skip} disabled={phase !== "review"} onChange={(e) => update(b.row, b.email, { skip: e.target.checked })} className="h-4 w-4 accent-accent" />
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
                <button type="button" onClick={() => askToConfirm({ title: "Discard this batch?", description: "The prepared emails and their edits will be removed. You can prepare a new batch later.", confirmLabel: "Discard batch", action: async () => { await deleteDraft(); setBatch([]); setPhase("idle"); setDraftNote(null); } })} className="btn-ghost">
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
        </div>
      )}
    </div>
  );
}
