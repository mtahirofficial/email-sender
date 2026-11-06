"use client";

import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";

/** Follow-up rules for the Inbox, and the notes the AI uses when it writes replies and follow-ups. */
export default function InboxSettingsForm({ settings }: { settings: { follow_up_after_days: number; max_follow_ups: number; instructions: string } }) {
  const toast = useToast();
  const [days, setDays] = useState(settings.follow_up_after_days);
  const [max, setMax] = useState(settings.max_follow_ups);
  const [notes, setNotes] = useState(settings.instructions);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpAfterDays: days, maxFollowUps: max, instructions: notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save.");
      toast.success("Inbox settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="inbox" className="card scroll-mt-24 p-5 sm:p-7">
      <h2 className="font-serif text-xl text-ink">Inbox: follow-ups and AI notes</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-ink-soft">
        When an email you sent gets no answer, the Inbox suggests a follow-up. Choose when, and tell the AI what to know when it writes for you.
      </p>
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="fu-days" className="label">
              Follow up after (days)
            </label>
            <input id="fu-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-28" />
          </div>
          <div>
            <label htmlFor="fu-max" className="label">
              At most this many follow-ups
            </label>
            <input id="fu-max" type="number" min={0} max={5} value={max} onChange={(e) => setMax(Number(e.target.value))} className="input w-28" />
          </div>
        </div>
        <div>
          <label htmlFor="fu-notes" className="label">
            Notes for the AI
          </label>
          <textarea
            id="fu-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What you offer, your prices, how you like to answer. The AI uses only what is here and in the conversation, so it does not invent prices or promises."
            className="input"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <SpinnerIcon /> : null} Save
        </button>
      </form>
    </section>
  );
}
