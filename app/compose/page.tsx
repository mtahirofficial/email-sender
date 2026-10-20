import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import { listConnectedAccounts } from "@/lib/accounts";
import ConnectAccounts from "@/components/ConnectAccounts";
import EmailForm from "@/components/EmailForm";
import AlertBanner from "@/components/AlertBanner";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";

export const metadata: Metadata = { title: "Compose", robots: { index: false, follow: false } };

export default async function ComposePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accounts = await listConnectedAccounts(supabase, user.id);
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
          <EmailForm accounts={accounts} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
