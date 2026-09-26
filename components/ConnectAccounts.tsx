"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";

export default function ConnectAccounts({ accounts }: { accounts: ConnectedAccount[] }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function disconnect(accountId: string) {
    setRemovingId(accountId);
    await fetch("/api/accounts/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    setRemovingId(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" className="font-serif text-lg text-ink mb-1">
        Connected accounts
      </h2>
      <p className="text-sm text-ink-soft mb-4">
        Mail sends through the account you pick below — never through Outbox
        itself. Connect the address you want recipients to actually see.
      </p>

      <div className="border border-line bg-white divide-y divide-line">
        {accounts.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-soft">
            No accounts connected yet.
          </p>
        )}
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`shrink-0 text-[11px] px-1.5 py-0.5 border ${
                  account.provider === "google"
                    ? "border-accent text-accent-deep"
                    : "border-amber text-amber"
                }`}
              >
                {account.provider === "google" ? "Gmail" : "Outlook"}
              </span>
              <span className="text-sm text-ink truncate">{account.email}</span>
            </div>
            <button
              type="button"
              onClick={() => disconnect(account.id)}
              disabled={removingId === account.id}
              className="shrink-0 text-xs text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              {removingId === account.id ? "Removing…" : "Disconnect"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href="/oauth/google"
          className="text-center border border-line bg-white text-sm text-ink py-2 hover:border-accent transition-colors"
        >
          Connect Gmail
        </a>
        <a
          href="/oauth/microsoft"
          className="text-center border border-line bg-white text-sm text-ink py-2 hover:border-amber transition-colors"
        >
          Connect Outlook
        </a>
      </div>
    </section>
  );
}
