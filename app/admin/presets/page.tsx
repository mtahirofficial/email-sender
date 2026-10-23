import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { toHeaderUser } from "@/lib/header-user";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import PresetsManager, { type PresetRow } from "@/components/admin/PresetsManager";

export const metadata: Metadata = { title: "AI presets", robots: { index: false, follow: false } };

export default async function AdminPresetsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  const { data, error } = await createAdminClient()
    .from("ai_presets")
    .select("id, label, prompt, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: true });
  if (error) console.error("presets: could not load", error);

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">AI presets</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">
          These are the buttons users see in &ldquo;Write with AI&rdquo;. Clicking one fills the prompt box, and the user can edit it before generating.
        </p>
        {error && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load presets. Run supabase/migrations_add_ai_presets.sql in the Supabase SQL Editor first.
          </p>
        )}
        <PresetsManager presets={(data ?? []) as PresetRow[]} />
      </main>
      <SiteFooter />
    </>
  );
}
