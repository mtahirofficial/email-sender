"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";

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
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-start">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
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
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="recipient to test with"
        className="flex-1 min-w-[220px] border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
      />
      <button
        type="submit"
        disabled={sending}
        className="bg-accent text-white text-sm px-4 py-2 hover:bg-accent-deep transition-colors disabled:opacity-60 whitespace-nowrap"
      >
        {sending ? "Sending…" : "Send this test"}
      </button>
      {result && (
        <p className={`text-sm ${result.type === "error" ? "text-red-700" : "text-accent-deep"}`}>
          {result.text}
        </p>
      )}
    </form>
  );
}
