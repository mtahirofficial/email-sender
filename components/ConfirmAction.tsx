"use client";

import { useCallback, useEffect, useState } from "react";
import { useScrollLock } from "@/components/useScrollLock";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => void | Promise<void>;
};

/** Shared, accessible confirmation dialog for destructive user actions. */
export function useConfirmAction() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useScrollLock(confirmation !== null);

  const askToConfirm = useCallback((next: Confirmation) => {
    setError(null);
    setConfirmation(next);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setConfirmation(null);
    setError(null);
  }, [busy]);

  useEffect(() => {
    if (!confirmation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmation, busy, close]);

  const run = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmation.action();
      setConfirmation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const dialog = confirmation ? (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 text-ink shadow-lift sm:p-6">
        <h2 id="confirm-action-title" className="font-serif text-xl">{confirmation.title}</h2>
        <p id="confirm-action-description" className="mt-2 text-sm leading-relaxed text-ink-soft">{confirmation.description}</p>
        {error && <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-600"><AlertIcon className="h-4 w-4 shrink-0" />{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={busy} className="btn-secondary">Keep it</button>
          <button type="button" onClick={() => void run()} disabled={busy} autoFocus className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-60">
            {busy && <SpinnerIcon />} {busy ? "Working…" : confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { askToConfirm, confirmationDialog: dialog };
}
