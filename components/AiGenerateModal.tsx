"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon, SparkleIcon, SpinnerIcon, XIcon } from "@/components/icons";

// The API writes at most this many drafts per request, so long recipient
// lists are generated in sequential batches.
const BATCH = 8;

export default function AiGenerateModal({
  open,
  onClose,
  recipients,
  replacesExisting,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  /** Valid recipient addresses, in the order their rows appear. Never sent to the AI. */
  recipients: string[];
  replacesExisting: boolean;
  onGenerated: (separate: boolean, items: { subject: string; body: string }[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [separate, setSeparate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSeparate = recipients.length > 1;
  const wantsSeparate = separate && canSeparate;
  const total = wantsSeparate ? recipients.length : 1;

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const items: { subject: string; body: string }[] = [];
    try {
      for (let done = 0; done < total; done += BATCH) {
        const count = Math.min(BATCH, total - done);
        setProgress({ done, total });
        const res = await fetch("/api/ai/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, count }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not generate the email.");
        items.push(...(data.items as { subject: string; body: string }[]));
        setRemaining(data.remaining ?? null);
      }
      onGenerated(wantsSeparate, items);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the email.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <form
        onSubmit={generate}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-title"
        className="card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-2xl sm:rounded-b-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="ai-title" className="flex items-center gap-2 font-serif text-xl text-ink">
              <SparkleIcon className="h-5 w-5 text-accent" /> Generate with AI
            </h2>
            <p className="mt-1 text-sm text-ink-soft">Describe the email and the AI will write the subject and message. You can edit both.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-mist"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <label htmlFor="ai-prompt" className="label">
          What should the email say?
        </label>
        <textarea
          id="ai-prompt"
          ref={textareaRef}
          required
          rows={6}
          minLength={10}
          maxLength={1500}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Invite them to a 30-minute product demo next Tuesday at 4 pm. Friendly but professional, and ask them to reply with a time that suits them."
          className="input resize-y"
        />
        <p className="mt-1 text-right text-xs text-ink-soft">{prompt.length}/1500</p>

        <label
          className={`mt-2 flex min-h-[44px] items-start gap-3 rounded-lg border border-line bg-paper px-3 py-2.5 ${
            canSeparate ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={wantsSeparate}
            disabled={!canSeparate}
            onChange={(e) => setSeparate(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#2E5D50]"
          />
          <span className="text-sm text-ink">
            Write a different message for each recipient
            <span className="block text-xs text-ink-soft">
              {canSeparate
                ? `Creates ${recipients.length} versions with the same meaning but different wording. You can edit each one.`
                : "Add at least 2 recipients to use this."}
            </span>
          </span>
        </label>

        {replacesExisting && (
          <p className="mt-3 text-xs text-ink-soft">This will replace the subject and message you have written so far.</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Your instructions are sent to an AI provider to write the draft. Recipient addresses are not sent. Don&rsquo;t
          include passwords or confidential details.
        </p>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">
            {remaining !== null ? `${remaining} draft${remaining === 1 ? "" : "s"} left today` : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={loading} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <SpinnerIcon /> : <SparkleIcon className="h-4 w-4" />}
              {loading
                ? progress && progress.total > 1
                  ? `Writing ${Math.min(progress.done + BATCH, progress.total)} of ${progress.total}…`
                  : "Writing…"
                : wantsSeparate
                ? `Generate ${total} versions`
                : "Generate"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
