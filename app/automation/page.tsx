import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getHeartbeat, isHeartbeatFresh } from "@/lib/scheduler";
import { toHeaderUser } from "@/lib/header-user";
import { getSettings, listSenders } from "@/lib/automation";
import { getAiPresets } from "@/lib/ai-presets";
import { InboxIcon } from "@/components/icons";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import AlertBanner from "@/components/AlertBanner";
import AutomationPanel, { type GoogleAccount, type SettingsView } from "@/components/automation/AutomationPanel";
import SendLog from "@/components/automation/SendLog";

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
        filter_col: s.filter_col ?? null,
        filter_value: s.filter_value ?? null,
        prompt: s.prompt,
        schedule_enabled: Boolean(s.schedule_enabled),
        schedule_time: s.schedule_time ?? "10:00",
        send_saturday: Boolean(s.send_saturday),
        pause_seconds: s.pause_seconds ?? 90,
      };
    }
  } catch {
    migrationMissing = true;
  }

  const [senders, presets] = await Promise.all([listSenders(supabase, user.id), getAiPresets(supabase)]);
  const lastTickAt = await getHeartbeat(createAdminClient()).catch(() => null);

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl text-ink">Automation</h1>
          <Link href="/sent" className="btn-secondary min-h-[40px] px-3.5 text-sm">
            <InboxIcon className="h-4 w-4" /> Sent emails
          </Link>
        </div>
        <p className="mb-6 mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Link a Google Sheet of websites and email addresses. Outbox writes a subject and message for every address with AI and sends them
          from your connected accounts, either when you press a button or automatically every day, and marks each address in your sheet.
        </p>

        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        {migrationMissing && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The database isn&rsquo;t ready for this feature yet. Run supabase/migrations_add_automation.sql and
            supabase/migrations_add_scheduled_automation.sql in the Supabase SQL Editor.
          </p>
        )}

        <AutomationPanel
          accounts={accounts}
          settings={settings}
          senders={senders}
          presets={presets}
          background={{ active: isHeartbeatFresh(lastTickAt), isAdmin: isAdminUser(user) }}
        />
        {settings && <SendLog />}
      </main>
      <SiteFooter />
    </>
  );
}
