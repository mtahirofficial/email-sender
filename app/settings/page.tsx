import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts, refreshAccountHealth } from "@/lib/accounts";
import { getInboxSettings } from "@/lib/inbox";
import SiteFooter from "@/components/marketing/SiteFooter";
import AlertBanner from "@/components/AlertBanner";
import ConnectAccounts from "@/components/ConnectAccounts";
import AiKeyForm from "@/components/AiKeyForm";
import InboxSettingsForm from "@/components/InboxSettingsForm";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Flags connections that Google/Microsoft no longer accept, so "Reconnect" shows only when needed.
  const accounts = await refreshAccountHealth(supabase, user.id, await listConnectedAccounts(supabase, user.id));
  const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  const inbox = await getInboxSettings(supabase, user.id);

  return (
    <>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-accent-deep">Workspace preferences</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Settings</h1>
          <p className="mt-1 text-sm text-ink-soft">Manage your connected accounts, email permissions, profile, and writing preferences.</p>
        </div>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>
        <div className="space-y-6">
          <section className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div><h2 className="font-serif text-xl text-ink">Profile & security</h2><p className="mt-1 text-sm text-ink-soft">Update your name, avatar, password, or close your Outbox account.</p></div>
            <Link href="/profile" className="btn-secondary min-h-10 px-3.5 text-sm">Open profile settings</Link>
          </section>
          <section id="permissions" className="card scroll-mt-24 p-5 sm:p-7">
            <h2 className="font-serif text-xl text-ink">Email permissions</h2>
            <p className="mb-5 mt-1 text-sm leading-relaxed text-ink-soft">Sending and inbox reading are separate permissions. Inbox access is optional and requested only when you enable it for a Gmail account.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-paper p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Send email</h3><span className="pill border-accent/20 bg-accent-soft text-accent-deep">Required</span></div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">Outbox sends through your connected mailbox. It cannot send as an address you have not connected.</p>
              </div>
              <div className="rounded-2xl border border-line bg-paper p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Read inbox and replies</h3><span className="pill border-line bg-white text-ink-soft">Optional</span></div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">Only enabled Gmail accounts are readable in Outbox. You can stop access by revoking Outbox in your Google Account; reconnect afterward if you still want send-only access.</p>
                <Link href="/inbox" className="btn-secondary mt-4 min-h-10 px-3 text-xs">Manage inbox access</Link>
              </div>
            </div>
            {accounts.length > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
                {accounts.map((account) => <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="truncate text-ink">{account.email}</span>
                  <span className={`pill ${account.provider === "google" && account.inbox_enabled ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft"}`}>
                    {account.provider === "google" && account.inbox_enabled ? "Inbox access on" : "Send-only access"}
                  </span>
                </li>)}
              </ul>
            )}
          </section>
          <div id="accounts" className="scroll-mt-24"><ConnectAccounts accounts={accounts} microsoftEnabled={microsoftEnabled} /></div>
          <div id="preferences" className="space-y-6 scroll-mt-24">
            <AiKeyForm />
            <InboxSettingsForm settings={inbox} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
