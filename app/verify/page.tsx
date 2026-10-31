import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import EmailVerifier from "@/components/EmailVerifier";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";

export const metadata: Metadata = { title: "Verify emails", robots: { index: false, follow: false } };

export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Verify emails</h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-ink-soft">
          Paste the addresses you plan to email. Outbox checks each one without sending anything, so you can keep the real ones and skip the
          addresses that would bounce.
        </p>
        <EmailVerifier />
      </main>
      <SiteFooter />
    </>
  );
}
