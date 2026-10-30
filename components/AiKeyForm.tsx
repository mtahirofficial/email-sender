"use client";

import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";

type Status = { hasKey: boolean; hint: string | null; limit: number; used: number; remaining: number | null };
type Notice = { ok: boolean; text: string } | null;

/** Settings card: use the free shared AI, or add your own Groq key to write drafts with it. */
export default function AiKeyForm() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function load() {
    try {
      const res = await fetch("/api/ai/key");
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      // the card still works; it just can't show the numbers
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the key.");
      setKey("");
      setNotice({ ok: true, text: "Key saved. Your drafts are now written with your Groq key." });
      toast.success("Groq key saved. Your drafts now use your key.");
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not save the key.";
      setNotice({ ok: false, text });
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/key", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not remove the key.");
      setNotice({ ok: true, text: "Key removed. Your drafts use the free shared AI again." });
      toast.info("Groq key removed. Back to the free shared AI.");
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not remove the key.";
      setNotice({ ok: false, text });
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ai" className="card scroll-mt-24 p-5 sm:p-7">
      <h2 className="font-serif text-xl text-ink">AI writing</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-ink-soft">
        Outbox writes your drafts with a free shared AI{status ? `, up to ${status.limit} drafts a day for each account` : ""}. If you want more,
        add your own free Groq API key and your drafts are written with your key instead.
      </p>

      {status && (
        <p
          className={`mb-5 rounded-lg px-3 py-2.5 text-sm ${
            status.hasKey ? "bg-accent-soft text-accent-deep" : (status.remaining ?? 0) <= 0 ? "bg-red-50 text-red-800" : "bg-mist text-ink"
          }`}
        >
          {status.hasKey
            ? `Using your own Groq key${status.hint ? ` (ends in ${status.hint})` : ""}. Outbox puts no daily limit on it.`
            : `Free shared AI: ${status.remaining ?? status.limit} of ${status.limit} drafts left today.`}
        </p>
      )}

      <form onSubmit={save} className="space-y-3">
        <div>
          <label htmlFor="groq-key" className="label">
            {status?.hasKey ? "Replace your Groq API key" : "Your Groq API key"}
          </label>
          <input
            id="groq-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="gsk_..."
            className="input"
          />
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-soft">
          <li>
            Open{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-deep underline underline-offset-2">
              console.groq.com/keys
            </a>{" "}
            and sign in (it is free).
          </li>
          <li>Create an API key and paste it above.</li>
          <li>Use a key from your own Groq account. Keys from one Groq account share the same limit.</li>
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || key.trim().length < 10} className="btn-primary">
            {busy ? <SpinnerIcon /> : null} Save key
          </button>
          {status?.hasKey && (
            <button type="button" onClick={remove} disabled={busy} className="btn-ghost">
              Remove key
            </button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-ink-soft">
          Your key is stored encrypted and is only used to write your drafts. Your instructions go to Groq under your account. You can remove the key any time.
        </p>

        <div aria-live="polite" className="min-h-[1.25rem] text-sm">
          {notice && (
            <p className={`flex items-center gap-2 ${notice.ok ? "text-accent-deep" : "text-red-700"}`}>
              {notice.ok ? <CheckIcon className="h-4 w-4 shrink-0" /> : <AlertIcon className="h-4 w-4 shrink-0" />} {notice.text}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
