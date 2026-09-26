import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listEmailLogs } from "@/lib/email-logs";
import SentList from "@/components/SentList";
import AppHeader from "@/components/AppHeader";

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
    <main className="min-h-screen">
      <AppHeader userEmail={user.email ?? ""} active="sent" />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <SentList logs={logs} />
      </div>
    </main>
  );
}
