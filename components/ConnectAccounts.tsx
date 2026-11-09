"use client";

import { useEffect, useState } from "react";
import { useScrollLock } from "@/components/useScrollLock";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";
import { MailIcon, PlusIcon, ShieldIcon } from "@/components/icons";
import { reconnectHref } from "@/lib/reconnect";
import { useConfirmAction } from "@/components/ConfirmAction";

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
  const [confirmGoogle, setConfirmGoogle] = useState(false);
  const { askToConfirm, confirmationDialog } = useConfirmAction();
  useScrollLock(confirmGoogle);

  useEffect(() => {
    if (!confirmGoogle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmGoogle(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmGoogle]);

  async function disconnect(accountId: string) {
    setRemovingId(accountId);
    try {
      const response = await fetch("/api/accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!response.ok) throw new Error("Could not disconnect this account. Please try again.");
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section aria-labelledby="accounts-heading" className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="accounts-heading" className="font-serif text-2xl text-ink">Sending accounts</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{accounts.length} {accounts.length === 1 ? "account" : "accounts"} connected. Outbox has send-only access to each one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmGoogle(true)} className="btn-secondary min-h-11"> <PlusIcon className="h-4 w-4" /> Connect Gmail</button>
          {microsoftEnabled ? (
            <a href="/oauth/microsoft" className="btn-secondary min-h-11"><PlusIcon className="h-4 w-4" /> Connect Outlook</a>
          ) : (
            <button type="button" disabled className="btn-secondary min-h-11"><PlusIcon className="h-4 w-4" /> Connect Outlook <span className="pill border-line bg-mist text-ink-soft">Coming soon</span></button>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-paper px-4 py-8 text-center">
          <MailIcon className="mx-auto h-6 w-6 text-ink-soft" />
          <p className="mt-2 text-sm text-ink-soft">No accounts connected yet.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="hidden items-center justify-between border-b border-line px-5 py-3 text-xs font-semibold uppercase tracking-[.1em] text-ink-soft sm:flex">
            <span>Account</span><span className="pr-[10.5rem]">Status</span>
          </div>
          <ul className="divide-y divide-line">
          {accounts.map((account) => {
            const isGoogle = account.provider === "google";
            const needs = Boolean(account.needs_reconnect);
            const canReconnect = isGoogle || microsoftEnabled;
            return (
              <li
                key={account.id}
                className={`px-4 py-4 sm:px-5 ${needs ? "bg-amber-soft/30" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
                  <span
                    aria-hidden="true"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                      "bg-accent-soft text-accent-deep"
                    }`}
                  >
                    {(account.email[0] ?? "?").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
                    <p className="truncate text-sm font-semibold text-ink" title={account.email}>
                      {account.email}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{isGoogle ? "Gmail" : "Outlook"}</p>
                  </div>
                  <div className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-sm font-medium ${needs ? "bg-amber-soft text-amber" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${needs ? "bg-amber" : "bg-emerald-500"}`} />
                    {needs ? "Reconnect needed" : "Connected"}
                  </div>

                  <button
                    type="button"
                    onClick={() => askToConfirm({
                      title: "Disconnect this account?",
                      description: `Outbox will remove the saved connection for ${account.email}. Scheduled emails from this account will stop. Your Google or Microsoft account will not be changed, and you can reconnect it later.`,
                      confirmLabel: "Disconnect account",
                      action: () => disconnect(account.id),
                    })}
                    disabled={removingId === account.id}
                    aria-label={`Disconnect ${account.email}`}
                    className="min-h-10 rounded-xl border border-red-500/25 px-3.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {removingId === account.id ? "Removing…" : "Disconnect"}
                  </button>
                </div>

                {needs && (
                  <p className="mt-3 pl-12 text-xs leading-relaxed text-amber">
                    This connection has expired, was removed, or is missing the &ldquo;Send email&rdquo; permission. Reconnect to keep sending.
                  </p>
                )}
                {needs && canReconnect && <a href={reconnectHref(account)} className="ml-12 mt-2 inline-flex text-xs font-semibold text-accent-deep underline underline-offset-2">Reconnect {isGoogle ? "Gmail" : "Outlook"}</a>}
              </li>
            );
          })}
          </ul>
        </div>
      )}

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-soft">
        <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Connecting only needs permission to send. Reading replies is separate and optional: you turn it on later in the Inbox.
      </p>

      {confirmationDialog}

      {confirmGoogle && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setConfirmGoogle(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="connect-gmail-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift">
            <h3 id="connect-gmail-title" className="font-serif text-lg text-ink">
              Before you connect Gmail
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              On Google&rsquo;s screen, keep <strong className="text-ink">every box ticked</strong>, especially &ldquo;Send email on your behalf&rdquo;. If it is
              unticked, Outbox can&rsquo;t send anything.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmGoogle(false)} className="btn-ghost">
                Cancel
              </button>
              <a href="/oauth/google" autoFocus className="btn-primary" onClick={() => setConfirmGoogle(false)}>
                Continue
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
