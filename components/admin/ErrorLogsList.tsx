"use client";

import { useState } from "react";
import type { AppErrorLog } from "@/lib/error-log";
import LocalTime from "@/components/LocalTime";
import { SpinnerIcon, TrashIcon } from "@/components/icons";

export default function ErrorLogsList({ initialLogs }: { initialLogs: AppErrorLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove(id: string) {
    setDeletingId(id);
    setProblem(null);
    try {
      const response = await fetch(`/api/admin/logs/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not remove this log entry.");
      setLogs((current) => current.filter((log) => log.id !== id));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not remove this log entry.");
    } finally {
      setDeletingId(null);
    }
  }

  if (logs.length === 0) {
    return <div className="card px-6 py-12 text-center text-sm text-ink-soft">No errors have been recorded.</div>;
  }

  return (
    <>
      {problem && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{problem}</p>}
      <ul className="space-y-3">
        {logs.map((log) => (
          <li key={log.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium text-ink">{log.response.message}</p>
                <p className="mt-1 text-xs text-ink-soft">{log.request.method} {log.request.path} · HTTP {log.response.status}{log.request.userId ? ` · User ${log.request.userId}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-xs text-ink-soft"><LocalTime iso={log.time} seconds /></p>
                <button
                  type="button"
                  onClick={() => void remove(log.id)}
                  disabled={deletingId !== null}
                  aria-label="Delete error log"
                  data-tooltip="Delete log"
                  className="icon-action hover:border-red-500/30 hover:bg-red-50 hover:text-red-700"
                >
                  {deletingId === log.id ? <SpinnerIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {log.error.upstreamResponse && (
              <div className="mt-3 rounded-lg border border-amber/30 bg-amber-soft/40 p-3 text-sm">
                <p className="font-semibold text-ink">
                  {log.error.upstreamResponse.service} response: HTTP {log.error.upstreamResponse.status ?? (/^no content$/i.test(log.error.upstreamResponse.statusText) ? 204 : "status unavailable")} {log.error.upstreamResponse.statusText}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Content type: {log.error.upstreamResponse.contentType || "not provided"}
                  {log.error.upstreamResponse.date ? ` · ${log.error.upstreamResponse.date}` : ""}
                </p>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {log.error.upstreamResponse.body || "Gmail returned an empty response body."}
                </pre>
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent-deep">Technical details</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-ink-soft">{JSON.stringify(log, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
