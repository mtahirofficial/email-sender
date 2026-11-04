import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import InboxPanel from "@/components/inbox/InboxPanel";
import AlertBanner from "@/components/AlertBanner";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";

export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

export default async function InboxPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Inbox</h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-ink-soft">
          Replies to the emails you sent, and a nudge for the ones nobody answered. Outbox helps you understand each reply and write the answer. Nothing is sent
          until you press Send.
        </p>
        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>
        <InboxPanel />
      </main>
      <SiteFooter />
    </>
  );
}
