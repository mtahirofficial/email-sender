"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";
import { MailIcon, PlusIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { reconnectHref } from "@/lib/reconnect";

export default function ConnectAccounts({
  accounts,
  microsoftEnabled,
}: {
  accounts: ConnectedAccount[];
  /** False until MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are configured. */
  microsoftEnabled: boolean;
}) {
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
        <ul className="mt-4 space-y-2.5">
          {accounts.map((account) => {
            const isGoogle = account.provider === "google";
            const needs = Boolean(account.needs_reconnect);
            const canReconnect = isGoogle || microsoftEnabled;
            return (
              <li
                key={account.id}
                className={`rounded-xl border px-3.5 py-3 ${needs ? "border-amber/40 bg-amber-soft/60" : "border-line bg-paper"}`}
              >
                <div className="flex items-center gap-3">
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
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${needs ? "bg-amber" : "bg-accent"}`} />
                      {isGoogle ? "Gmail" : "Outlook"} ·{" "}
                      <span className={needs ? "font-medium text-amber" : ""}>{needs ? "Needs reconnect" : "Connected"}</span>
                    </p>
                  </div>
                </div>

                {needs && (
                  <p className="mt-2.5 text-xs leading-relaxed text-amber">
                    This connection has expired or was removed. Reconnect to keep sending.
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-2.5">
                  {needs && canReconnect && (
                    <a href={reconnectHref(account)} aria-label={`Reconnect ${account.email}`} className="btn-primary min-h-[40px] px-3.5 text-xs">
                      Reconnect
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => disconnect(account.id)}
                    disabled={removingId === account.id}
                    aria-label={`Disconnect ${account.email}`}
                    className="btn-ghost min-h-[40px] px-3 text-xs"
                  >
                    {removingId === account.id ? "Removing…" : "Disconnect"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <a href="/oauth/google" className="btn-secondary">
          <PlusIcon className="h-4 w-4" /> Connect Gmail
        </a>
        {microsoftEnabled ? (
          <a href="/oauth/microsoft" className="btn-secondary">
            <PlusIcon className="h-4 w-4" /> Connect Outlook
          </a>
        ) : (
          <button type="button" disabled className="btn-secondary">
            <PlusIcon className="h-4 w-4" /> Connect Outlook
            <span className="pill border-line bg-mist text-ink-soft">Coming soon</span>
          </button>
        )}
      </div>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-soft">
        <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Send-only access. Outbox can&rsquo;t read your inbox.
      </p>
    </section>
  );
}
