"use client";

import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { useToast } from "@/components/Toaster";

/** Manual follow-up defaults for drafts created in Inbox. */
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
      toast.success("Manual follow-up settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="inbox" className="card scroll-mt-24 p-5 sm:p-7">
      <h2 className="font-serif text-xl text-ink">Inbox: manual follow-ups</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-ink-soft">
        These are your manual defaults: they control follow-up reminders and AI drafts you review and send yourself from Inbox. They never send email automatically. They apply whenever automatic follow-up is off for a sheet. Set automatic follow-ups separately in Automation for each sheet.
      </p>
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="fu-days" className="label">
              Show a manual follow-up after (days)
            </label>
            <input id="fu-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-28" />
          </div>
          <div>
            <label htmlFor="fu-max" className="label">
              Manual follow-up limit per contact
            </label>
            <input id="fu-max" type="number" min={0} max={5} value={max} onChange={(e) => setMax(Number(e.target.value))} className="input w-28" />
          </div>
        </div>
        <div>
          <label htmlFor="fu-notes" className="label">
            AI notes for manual drafts
          </label>
          <textarea
            id="fu-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What you offer, your prices, and how you like to write. These notes apply only to drafts created in Inbox."
            className="input"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <SpinnerIcon /> : null} Save manual follow-up settings
        </button>
      </form>
    </section>
  );
}
