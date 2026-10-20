import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import SettingsForm from "@/components/SettingsForm";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const headerUser = toHeaderUser(user);

  return (
    <>
      <SiteHeader initialUser={headerUser} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-6 font-serif text-3xl text-ink">Settings</h1>
        <SettingsForm user={headerUser} />
      </main>
      <SiteFooter />
    </>
  );
}
