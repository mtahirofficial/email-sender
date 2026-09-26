import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts } from "@/lib/accounts";
import ConnectAccounts from "@/components/ConnectAccounts";
import EmailForm from "@/components/EmailForm";
import AlertBanner from "@/components/AlertBanner";
import AppHeader from "@/components/AppHeader";

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
    <main className="min-h-screen">
      <AppHeader userEmail={user.email ?? ""} active="compose" />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        <div className="grid md:grid-cols-[280px_1fr] gap-10">
          <ConnectAccounts accounts={accounts} />
          <EmailForm accounts={accounts} />
        </div>
      </div>
    </main>
  );
}
