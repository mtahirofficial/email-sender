import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import { listConnectedAccounts, refreshAccountHealth } from "@/lib/accounts";
import { isAiConfigured } from "@/lib/ai";
import { getAiPresets } from "@/lib/ai-presets";
import ConnectAccounts from "@/components/ConnectAccounts";
import EmailForm from "@/components/EmailForm";
import AlertBanner from "@/components/AlertBanner";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import Link from "next/link";
import { SheetIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Compose", robots: { index: false, follow: false } };

export default async function ComposePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Flags connections that Google/Microsoft no longer accept, so "Reconnect" shows only when needed.
  const accounts = await refreshAccountHealth(supabase, user.id, await listConnectedAccounts(supabase, user.id));
  const presets = await getAiPresets(supabase);
  const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="sr-only">Compose email</h1>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        <div className="grid gap-8 md:grid-cols-[300px_1fr] md:items-start">
          <div className="md:sticky md:top-24">
            <ConnectAccounts accounts={accounts} microsoftEnabled={microsoftEnabled} />
          </div>
          <div className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-ink-soft">Emailing a list from a Google Sheet every day?</p>
              <Link href="/automation" className="btn-secondary min-h-[40px] px-3">
                <SheetIcon className="h-4 w-4 text-accent" /> Automate from a sheet
              </Link>
            </div>
            <EmailForm accounts={accounts} aiEnabled={isAiConfigured()} presets={presets} draftKey={user.id} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
