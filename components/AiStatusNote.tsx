"use client";

import { useEffect, useState } from "react";

type Status = { hasKey: boolean; hint: string | null; limit: number; used: number; remaining: number | null };

/**
 * One line about the AI: how many free drafts are left today, and how to get more by adding
 * your own Groq key in Settings. Opens Settings in a new tab so a half-written email is never lost.
 * `remaining` / `usingOwnKey` let the parent pass fresher numbers (e.g. right after writing drafts).
 */
export default function AiStatusNote({
  remaining,
  usingOwnKey,
  className = "",
}: {
  remaining?: number | null;
  usingOwnKey?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/key")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data as Status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  const link = (text: string) => (
    <a href="/settings#ai" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-deep underline underline-offset-2">
      {text}
    </a>
  );

  if (status.hasKey || usingOwnKey) {
    return (
      <p className={`text-xs leading-relaxed text-ink-soft ${className}`}>
        Writing with your own Groq key, so Outbox puts no daily limit on you. {link("Manage key")}
      </p>
    );
  }

  const left = typeof remaining === "number" ? remaining : status.remaining ?? status.limit;
  const empty = left <= 0;
  return (
    <p className={`text-xs leading-relaxed ${empty ? "text-red-700" : "text-ink-soft"} ${className}`}>
      Free AI: {left} of {status.limit} drafts left today. Want more? Add your own free Groq API key in Settings ({link("add key")}).
    </p>
  );
}
