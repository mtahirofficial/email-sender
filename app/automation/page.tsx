import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toHeaderUser } from "@/lib/header-user";
import { getSettings } from "@/lib/automation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import AlertBanner from "@/components/AlertBanner";
import AutomationPanel, { type GoogleAccount, type SettingsView } from "@/components/automation/AutomationPanel";

export const metadata: Metadata = { title: "Automation", robots: { index: false, follow: false } };

export default async function AutomationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Google accounts, with their Sheets flag (older databases may not have the column yet).
  let migrationMissing = false;
  let accounts: GoogleAccount[] = [];
  const withFlag = await supabase.from("connected_accounts").select("id, email, sheets_enabled").eq("user_id", user.id).eq("provider", "google");
  if (withFlag.error) {
    migrationMissing = true;
    const plain = await supabase.from("connected_accounts").select("id, email").eq("user_id", user.id).eq("provider", "google");
    accounts = (plain.data ?? []).map((a) => ({ id: a.id as string, email: a.email as string, sheets_enabled: false }));
  } else {
    accounts = (withFlag.data ?? []) as GoogleAccount[];
  }

  let settings: SettingsView | null = null;
  try {
    const s = await getSettings(supabase, user.id);
    if (s) {
      settings = {
        account_id: s.account_id,
        spreadsheet_id: s.spreadsheet_id,
        sheet_title: s.sheet_title,
        website_col: s.website_col,
        email_col: s.email_col,
        sent_col: s.sent_col,
        daily_limit: s.daily_limit,
        prompt: s.prompt,
      };
    }
  } catch {
    migrationMissing = true;
  }

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Automation</h1>
        <p className="mb-6 mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Link a Google Sheet of websites and email addresses. Every day Outbox picks the next unsent addresses,
          writes a subject and message for each one with AI, and after you review and send, ticks them off in your sheet.
        </p>

        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        {migrationMissing && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The database isn&rsquo;t ready for this feature yet. Run supabase/migrations_add_automation.sql in the Supabase SQL Editor.
          </p>
        )}

        <AutomationPanel accounts={accounts} settings={settings} />
      </main>
      <SiteFooter />
    </>
  );
}
