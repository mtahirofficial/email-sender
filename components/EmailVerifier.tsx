"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";

type Status = "valid" | "invalid" | "risky" | "unknown";
type Result = { email: string; status: Status; detail: string };
type Filter = "all" | Status;

const CHUNK = 5; // addresses per request, so the progress bar moves and one slow domain can't block everything

const LABELS: Record<Filter, string> = { all: "All", valid: "Valid", risky: "Risky", unknown: "Unknown", invalid: "Invalid" };
const BADGE: Record<Status, string> = {
  valid: "bg-accent-soft text-accent-deep",
  invalid: "bg-red-50 text-red-800",
  risky: "bg-amber-soft text-amber",
  unknown: "bg-mist text-ink-soft",
};

function parseEmails(text: string) {
  return Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)));
}

/** Spreadsheet programs run text that starts with = + - @ as a formula, so defuse it in the CSV. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EmailVerifier() {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [portBlocked, setPortBlocked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const stopRef = useRef(false);

  const count = parseEmails(input).length;

  useEffect(() => {
    fetch("/api/verify-emails")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRemaining(data.remaining))
      .catch(() => {});
  }, []);

  async function start() {
    const emails = parseEmails(input);
    if (emails.length === 0 || running) return;

    stopRef.current = false;
    setRunning(true);
    setResults([]);
    setFilter("all");
    setError(null);
    setPortBlocked(false);
    setProgress({ done: 0, total: emails.length });

    const all: Result[] = [];
    let blocked = false;
    let stoppedEarly = false;

    for (let i = 0; i < emails.length; i += CHUNK) {
      if (stopRef.current) {
        stoppedEarly = true;
        break;
      }
      const chunk = emails.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/verify-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (typeof data.remaining === "number") setRemaining(data.remaining);
        if (!res.ok) {
          // e.g. the daily limit: stop here and keep what was checked so far
          setError(data.error ?? `The check failed (HTTP ${res.status}).`);
          stoppedEarly = true;
          break;
        }
        all.push(...(data.results as Result[]));
        if (data.portBlocked) blocked = true;
      } catch (err) {
        chunk.forEach((email) => all.push({ email, status: "unknown", detail: `The request failed: ${err instanceof Error ? err.message : "network error"}` }));
      }
      setResults([...all]);
      setProgress({ done: Math.min(emails.length, i + CHUNK), total: emails.length });
      if (blocked) setPortBlocked(true);
    }

    setRunning(false);
    const valid = all.filter((r) => r.status === "valid").length;
    if (all.length === 0) toast.error("Nothing was checked.");
    else if (stoppedEarly) toast.info(`Stopped after ${all.length} of ${emails.length}. ${valid} valid so far.`);
    else toast.success(`Done: ${valid} valid out of ${all.length}.`);
  }

  const counts: Record<Filter, number> = { all: results.length, valid: 0, risky: 0, unknown: 0, invalid: 0 };
  results.forEach((r) => counts[r.status]++);
  const rows = results.filter((r) => filter === "all" || r.status === filter);
  const validList = () => results.filter((r) => r.status === "valid").map((r) => r.email);

  async function copyValid() {
    try {
      await navigator.clipboard.writeText(validList().join("\n"));
      setCopied(true);
      toast.success(`${validList().length} valid addresses copied.`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Use the download button instead.");
    }
  }

  function downloadCsv() {
    const csv = "email,status,detail\n" + results.map((r) => [csvCell(r.email), r.status, csvCell(r.detail)].join(",")).join("\n");
    download("verified-emails.csv", csv, "text/csv");
  }

  function clearAll() {
    if (running) return;
    setInput("");
    setResults([]);
    setError(null);
    setPortBlocked(false);
    setProgress({ done: 0, total: 0 });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <label htmlFor="verify-input" className="label">
          Email addresses
        </label>
        <textarea
          id="verify-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"info@example.com\nsales@example.com"}
          spellCheck={false}
          className="input h-48 resize-y font-mono text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={start} disabled={running || count === 0} className="btn-primary">
            {running ? <SpinnerIcon /> : null} {running ? "Checking..." : "Check emails"}
          </button>
          {running && (
            <button type="button" onClick={() => (stopRef.current = true)} className="btn-secondary">
              Stop
            </button>
          )}
          <button type="button" onClick={clearAll} disabled={running} className="btn-ghost">
            Clear
          </button>
          <span className="text-sm text-ink-soft">{count > 0 ? `${count} address${count === 1 ? "" : "es"}` : ""}</span>
          {remaining !== null && <span className="ml-auto text-xs text-ink-soft">{remaining} checks left today</span>}
        </div>

        {(running || progress.total > 0) && (
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Checking progress"
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {portBlocked && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-3 text-sm leading-relaxed text-amber">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This server could not reach the mail servers, so most results say &ldquo;unknown&rdquo;. Outbound port 25 is probably blocked here. Most
            shared hosting blocks it; a VPS usually allows it.
          </span>
        </p>
      )}

      {results.length > 0 && (
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results">
              {(Object.keys(LABELS) as Filter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    filter === key ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-white text-ink-soft hover:bg-mist"
                  }`}
                >
                  {LABELS[key]}: {counts[key]}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={copyValid} disabled={counts.valid === 0} className="btn-secondary min-h-[36px] px-3 text-xs">
                {copied ? "Copied" : "Copy valid"}
              </button>
              <button
                type="button"
                onClick={() => download("valid-emails.txt", validList().join("\n"), "text/plain")}
                disabled={counts.valid === 0}
                className="btn-secondary min-h-[36px] px-3 text-xs"
              >
                Valid (.txt)
              </button>
              <button type="button" onClick={downloadCsv} className="btn-secondary min-h-[36px] px-3 text-xs">
                All (.csv)
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-2.5 py-2 font-semibold">Email</th>
                  <th className="px-2.5 py-2 font-semibold">Status</th>
                  <th className="px-2.5 py-2 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2.5 py-6 text-center text-ink-soft">
                      No results in this group.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.email} className="border-b border-line align-top last:border-0">
                      <td className="break-all px-2.5 py-2 text-ink">{r.email}</td>
                      <td className="px-2.5 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="px-2.5 py-2 text-ink-soft">{r.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            &ldquo;Valid&rdquo; means the mail server accepted the address. Some providers accept everything or refuse to answer, so they show as risky or
            unknown. Nothing is ever sent to these addresses.
          </p>
        </div>
      )}
    </div>
  );
}
