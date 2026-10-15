import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listEmailLogs } from "@/lib/email-logs";
import SentList from "@/components/SentList";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Sent",
  robots: { index: false, follow: false },
};

export default async function SentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const logs = await listEmailLogs(supabase, user.id, 100);

  return (
    <>
      <AppHeader userEmail={user.email ?? ""} active="sent" />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <SentList logs={logs} />
      </main>
    </>
  );
}
