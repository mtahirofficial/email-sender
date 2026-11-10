import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getHeartbeat, isHeartbeatFresh } from "@/lib/scheduler";
import { listSettings, listSenders } from "@/lib/automation";
import { getAiPresets } from "@/lib/ai-presets";
import SiteFooter from "@/components/marketing/SiteFooter";
import AlertBanner from "@/components/AlertBanner";
import AutomationPanel, { type GoogleAccount, type SettingsView } from "@/components/automation/AutomationPanel";

export const metadata: Metadata = { title: "Automation", robots: { index: false, follow: false } };

export default async function AutomationPage() {
  const supabase = await createClient();
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

  let settingsList: SettingsView[] = [];
  let multipleSheetsReady = true;
  try {
    const list = await listSettings(supabase, user.id);
    if (list.some((s) => !s.id)) {
      multipleSheetsReady = false;
      migrationMissing = true;
    }
    settingsList = list.map((s) => ({
        // The legacy one-sheet table has no row id. Keep its saved sheet visible until the migration is applied.
        id: s.id || `legacy:${s.spreadsheet_id}`,
        account_id: s.account_id,
        spreadsheet_id: s.spreadsheet_id,
        sheet_title: s.sheet_title,
        website_col: s.website_col,
        email_col: s.email_col,
        sent_col: s.sent_col,
        filter_col: s.filter_col ?? null,
        filter_value: s.filter_value ?? null,
        extra_cols: Array.isArray(s.extra_cols) ? s.extra_cols : [],
        prompt: s.prompt,
        ai_notes: s.ai_notes ?? "",
        schedule_enabled: Boolean(s.schedule_enabled),
        schedule_time: s.schedule_time ?? "10:00",
        send_saturday: Boolean(s.send_saturday),
        pause_seconds: s.pause_seconds ?? 90,
      }));
  } catch {
    migrationMissing = true;
  }

  const [sendersByAutomation, defaultSenders, presets] = await Promise.all([
    Promise.all(settingsList.map(async (s) => [s.id, await listSenders(supabase, user.id, s.id)] as const)),
    listSenders(supabase, user.id),
    getAiPresets(supabase),
  ]);
  const lastTickAt = await getHeartbeat(createAdminClient()).catch(() => null);
  const sheetsAccessAccount = accounts.find((account) => account.sheets_enabled);

  return (
    <>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl text-ink">Automation</h1>
            <p className="mt-1 text-base text-ink-soft">Each linked sheet is its own workflow. Set the daily limits, pick a time, and let it run.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-ink">
              <span className={`h-2.5 w-2.5 rounded-full ${sheetsAccessAccount ? "bg-emerald-600" : "bg-ink-soft/40"}`} />
              {sheetsAccessAccount ? `Sheets access: ${sheetsAccessAccount.email}` : "Sheets access not enabled"}
            </span>
            <a href="/sent" className="btn-secondary min-h-11 px-5">Sent emails</a>
          </div>
        </div>

        <Suspense fallback={null}>
          <AlertBanner />
        </Suspense>

        {migrationMissing && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {multipleSheetsReady
              ? <>The database isn&rsquo;t ready for automation yet. Run the automation migrations in the Supabase SQL Editor.</>
              : <>Your existing linked sheet is preserved. Run <code>supabase/migrations_add_multiple_automations.sql</code> in the Supabase SQL Editor to restore full controls and add more sheets.</>}
          </p>
        )}

        <AutomationPanel
          accounts={accounts}
          settingsList={settingsList}
          sendersByAutomation={Object.fromEntries(sendersByAutomation)}
          defaultSenders={defaultSenders}
          multipleSheetsReady={multipleSheetsReady}
          presets={presets}
          background={{ active: isHeartbeatFresh(lastTickAt), isAdmin: isAdminUser(user) }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
