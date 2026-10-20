import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listEmailLogs } from "@/lib/email-logs";
import { isAdminUser } from "@/lib/admin";
import SentList from "@/components/SentList";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import { toHeaderUser } from "@/lib/header-user";

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
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full flex-1 max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <SentList logs={logs} />
      </main>
      <SiteFooter />
    </>
  );
}
