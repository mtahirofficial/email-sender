import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts } from "@/lib/accounts";
import ConnectAccounts from "@/components/ConnectAccounts";
import EmailForm from "@/components/EmailForm";
import AlertBanner from "@/components/AlertBanner";
import AppHeader from "@/components/AppHeader";

// Signed-in screen only. Signed-out visitors are served the public landing page instead.
export const metadata: Metadata = {
  title: "Compose",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accounts = await listConnectedAccounts(supabase, user.id);

  return (
    <>
      <AppHeader userEmail={user.email ?? ""} active="compose" />

      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="sr-only">Compose email</h1>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        <div className="grid gap-8 md:grid-cols-[300px_1fr] md:items-start">
          <div className="md:sticky md:top-24">
            <ConnectAccounts accounts={accounts} />
          </div>
          <EmailForm accounts={accounts} />
        </div>
      </main>
    </>
  );
}
