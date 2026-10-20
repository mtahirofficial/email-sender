"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, SendIcon, SpinnerIcon } from "@/components/icons";

export default function ContactForm() {
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setResult({ ok: false, text: data.error ?? "Something went wrong. Please try again." });
      return;
    }
    setResult({ ok: true, text: "Thanks! Your message has been sent. We'll reply by email." });
    setValues({ name: "", email: "", subject: "", message: "", website: "" });
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="label">Name</label>
          <input id="c-name" required autoComplete="name" value={values.name} onChange={set("name")} className="input" />
        </div>
        <div>
          <label htmlFor="c-email" className="label">Email</label>
          <input id="c-email" type="email" required autoComplete="email" value={values.email} onChange={set("email")} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="c-subject" className="label">Subject <span className="font-normal text-ink-soft">(optional)</span></label>
        <input id="c-subject" value={values.subject} onChange={set("subject")} className="input" />
      </div>
      <div>
        <label htmlFor="c-message" className="label">Message</label>
        <textarea id="c-message" required rows={7} minLength={10} maxLength={3000} value={values.message} onChange={set("message")} className="input resize-y" />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>

      <div aria-live="polite">
        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              result.ok ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {result.ok ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            {result.text}
          </p>
        )}
      </div>

      <button type="submit" disabled={sending} className="btn-primary w-full sm:w-auto">
        {sending ? <SpinnerIcon /> : <SendIcon className="h-4 w-4" />} {sending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
