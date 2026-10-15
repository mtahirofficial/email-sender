"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";
import { AlertIcon, CheckIcon, SendIcon, SpinnerIcon } from "@/components/icons";

export default function EmailTestSendForm({
  testId,
  accounts,
}: {
  testId: string;
  accounts: ConnectedAccount[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Connect a Gmail or Outlook account on the Compose page before sending a test email.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);

    const res = await fetch("/api/email-test/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId, accountId, to }),
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setResult({ type: "error", text: data.error ?? "Sending failed." });
      return;
    }

    setResult({ type: "success", text: `Sent from ${data.from} to ${to}.` });
    setTo("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Send from"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input sm:max-w-[260px]"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email} ({account.provider === "google" ? "Gmail" : "Outlook"})
            </option>
          ))}
        </select>
        <input
          type="email"
          required
          aria-label="Recipient to test with"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient to test with"
          className="input flex-1"
        />
        <button type="submit" disabled={sending} className="btn-primary whitespace-nowrap">
          {sending ? <SpinnerIcon /> : <SendIcon className="h-4 w-4" />}
          {sending ? "Sending…" : "Send this test"}
        </button>
      </div>
      <div aria-live="polite">
        {result && (
          <p
            className={`flex items-start gap-2 text-sm ${
              result.type === "error" ? "text-red-700" : "text-accent-deep"
            }`}
          >
            {result.type === "error" ? (
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {result.text}
          </p>
        )}
      </div>
    </form>
  );
}
