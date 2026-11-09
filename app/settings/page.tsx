import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import { listConnectedAccounts, refreshAccountHealth } from "@/lib/accounts";
import { getInboxSettings } from "@/lib/inbox";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import AlertBanner from "@/components/AlertBanner";
import ConnectAccounts from "@/components/ConnectAccounts";
import AiKeyForm from "@/components/AiKeyForm";
import InboxSettingsForm from "@/components/InboxSettingsForm";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const supabase = await createClient();
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
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-6 font-serif text-3xl text-ink">Settings</h1>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>
        <div className="space-y-6">
          <ConnectAccounts accounts={accounts} microsoftEnabled={microsoftEnabled} />
          <AiKeyForm />
          <InboxSettingsForm settings={inbox} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
