import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts, refreshAccountHealth } from "@/lib/accounts";
import { isAiConfigured } from "@/lib/ai";
import { getUserKeyHint } from "@/lib/ai-keys";
import { getAiPresets } from "@/lib/ai-presets";
import EmailForm from "@/components/EmailForm";
import AlertBanner from "@/components/AlertBanner";
import SiteFooter from "@/components/marketing/SiteFooter";
import Link from "next/link";
import { InboxIcon, SheetIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Compose", robots: { index: false, follow: false } };

export default async function ComposePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Flags connections that Google/Microsoft no longer accept, so "Reconnect" shows only when needed.
  const accounts = await refreshAccountHealth(supabase, user.id, await listConnectedAccounts(supabase, user.id));
  const presets = await getAiPresets(supabase);

  return (
    <>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="sr-only">Compose email</h1>
        <div className="mb-4 flex justify-end">
          <Link href="/sent" className="btn-secondary min-h-[40px] px-3.5 text-sm">
            <InboxIcon className="h-4 w-4" /> Sent emails
          </Link>
        </div>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        <div className="mx-auto max-w-4xl">
          <div className="space-y-4">
            {accounts.length === 0 && (
              <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-ink-soft">Connect a Gmail or Outlook account to start sending.</p>
                <Link href="/settings" className="btn-primary min-h-[40px] px-3.5 text-sm">
                  Connect an account in Settings
                </Link>
              </div>
            )}
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-ink-soft">Emailing a list from a Google Sheet every day?</p>
              <Link href="/automation" className="btn-secondary min-h-[40px] px-3">
                <SheetIcon className="h-4 w-4 text-accent" /> Automate from a sheet
              </Link>
            </div>
            <EmailForm accounts={accounts} aiEnabled={isAiConfigured() || (await getUserKeyHint(user.id)).hasKey} presets={presets} draftKey={user.id} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
