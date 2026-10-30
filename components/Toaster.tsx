"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertIcon, CheckIcon, XIcon } from "@/components/icons";

// Small pop-up notifications ("toasts"), e.g. "12 emails sent". Wrap the app in <ToastProvider>
// and call useToast() anywhere. Outside the provider the calls do nothing, so nothing can break.

type Kind = "success" | "error" | "info";
type ToastItem = { id: number; kind: Kind; text: string };
type ToastApi = {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
};

const noop = () => {};
const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop });

export const useToast = () => useContext(ToastContext);

const MAX_VISIBLE = 4;
const DURATION: Record<Kind, number> = { success: 4000, info: 5000, error: 8000 };

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.filter((t) => t.text !== text), { id, kind, text }].slice(-MAX_VISIBLE));
      window.setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => push("success", text),
      error: (text) => push("error", text),
      info: (text) => push("info", text),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : t.kind === "success"
                ? "border-accent/30 bg-accent-soft text-accent-deep"
                : "border-line bg-paper text-ink"
            }`}
          >
            {t.kind === "error" ? (
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : t.kind === "success" ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : null}
            <p className="min-w-0 flex-1 leading-snug">{t.text}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-70 hover:opacity-100"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
