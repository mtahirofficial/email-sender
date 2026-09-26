"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";

type SendResult = {
  ok: boolean;
  from?: string;
  sentCount?: number;
  failedCount?: number;
  results?: { to: string; ok: boolean; error?: string }[];
  error?: string;
};

export default function EmailForm({ accounts }: { accounts: ConnectedAccount[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const hasAccounts = accounts.length > 0;
  const recipientCount = to
    .split(/[\n,;]/)
    .map((r) => r.trim())
    .filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setSending(true);

    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, to, subject, body: message }),
    });
    const data = await res.json();

    setSending(false);
    setResult(data);
    router.refresh();

    if (res.ok && data.ok) {
      setTo("");
      setSubject("");
      setMessage("");
    }
  }

  return (
    <section aria-labelledby="compose-heading">
      <h2 id="compose-heading" className="font-serif text-lg text-ink mb-1">
        Compose
      </h2>
      <p className="text-sm text-ink-soft mb-4">
        The recipient sees exactly the "From" address you pick — this app
        never substitutes its own. Add several recipients and each one gets
        their own separate email, not a shared To/Cc/Bcc line.
      </p>

      {!hasAccounts ? (
        <div className="border border-line bg-white px-4 py-6 text-sm text-ink-soft">
          Connect a Gmail or Outlook account on the left before composing.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="border border-line bg-white p-5 space-y-4">
          <div>
            <label htmlFor="from" className="block text-sm text-ink-soft mb-1.5">
              From
            </label>
            <select
              id="from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} ({account.provider === "google" ? "Gmail" : "Outlook"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="to" className="block text-sm text-ink-soft mb-1.5">
              To
              {recipientCount > 1 && (
                <span className="text-ink-soft"> — {recipientCount} separate emails</span>
              )}
            </label>
            <textarea
              id="to"
              required
              rows={3}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="one@example.com, two@example.com&#10;or one per line"
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white resize-y"
            />
            <p className="text-xs text-ink-soft mt-1">
              Separate multiple addresses with a comma or a new line.
            </p>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm text-ink-soft mb-1.5">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm text-ink-soft mb-1.5">
              Message
            </label>
            <textarea
              id="body"
              required
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white resize-y"
            />
          </div>

          {result && (
            <div className="text-sm space-y-1">
              {result.error && <p className="text-red-700">{result.error}</p>}
              {typeof result.sentCount === "number" && (
                <>
                  <p className={result.failedCount ? "text-amber" : "text-accent-deep"}>
                    Sent {result.sentCount} of {(result.sentCount ?? 0) + (result.failedCount ?? 0)}{" "}
                    from {result.from}.
                  </p>
                  {result.results
                    ?.filter((r) => !r.ok)
                    .map((r) => (
                      <p key={r.to} className="text-red-700 text-xs">
                        Failed: {r.to}
                      </p>
                    ))}
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="bg-accent text-white text-sm px-5 py-2.5 hover:bg-accent-deep transition-colors disabled:opacity-60"
          >
            {sending
              ? "Sending…"
              : recipientCount > 1
              ? `Send ${recipientCount} separate emails`
              : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
