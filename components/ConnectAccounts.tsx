"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";
import { MailIcon, PlusIcon, ShieldIcon, UsersIcon } from "@/components/icons";

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
    <section aria-labelledby="accounts-heading" className="card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent-deep">
          <UsersIcon className="h-4 w-4" />
        </span>
        <h2 id="accounts-heading" className="font-serif text-lg text-ink">
          Connected accounts
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Mail sends through the account you pick, never through Outbox itself.
      </p>

      {accounts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-center">
          <MailIcon className="mx-auto h-6 w-6 text-ink-soft" />
          <p className="mt-2 text-sm text-ink-soft">No accounts connected yet.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {accounts.map((account) => {
            const isGoogle = account.provider === "google";
            return (
              <li
                key={account.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    isGoogle ? "bg-accent-soft text-accent-deep" : "bg-amber-soft text-amber"
                  }`}
                >
                  {isGoogle ? "G" : "O"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink" title={account.email}>
                    {account.email}
                  </p>
                  <p className={`text-xs ${isGoogle ? "text-accent-deep" : "text-amber"}`}>
                    {isGoogle ? "Gmail" : "Outlook"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(account.id)}
                  disabled={removingId === account.id}
                  aria-label={`Disconnect ${account.email}`}
                  className="btn-ghost -mr-1 px-2 text-xs"
                >
                  {removingId === account.id ? "Removing…" : "Disconnect"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <a href="/oauth/google" className="btn-secondary">
          <PlusIcon className="h-4 w-4" /> Connect Gmail
        </a>
        <a href="/oauth/microsoft" className="btn-secondary">
          <PlusIcon className="h-4 w-4" /> Connect Outlook
        </a>
      </div>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-soft">
        <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Send-only access. Outbox can&rsquo;t read your inbox.
      </p>
    </section>
  );
}
