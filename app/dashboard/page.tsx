import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listConnectedAccounts } from "@/lib/accounts";
import SiteFooter from "@/components/marketing/SiteFooter";
import LocalTime from "@/components/LocalTime";
import { AlertIcon, CheckIcon, DashboardIcon, SendIcon, UsersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Overview", robots: { index: false, follow: false } };

const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "UTC" });

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 6);
  since.setUTCHours(0, 0, 0, 0);
  const [success, failed, accounts, recent, weekly] = await Promise.all([
    supabase.from("email_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "sent"),
    supabase.from("email_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "failed"),
    listConnectedAccounts(supabase, user.id).catch(() => []),
    supabase.from("email_logs").select("id, from_email, to_email, subject, status, error, sent_at").eq("user_id", user.id).order("sent_at", { ascending: false }).limit(8),
    supabase.from("email_logs").select("status, sent_at").eq("user_id", user.id).gte("sent_at", since.toISOString()).order("sent_at", { ascending: true }).limit(2000),
  ]);

  const sentTotal = success.count ?? 0;
  const failedTotal = failed.count ?? 0;
  const recentRows = recent.data ?? [];
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + i);
    const key = dayKey(date);
    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      count: (weekly.data ?? []).filter((row) => dayKey(new Date(row.sent_at)) === key).length,
    };
  });
  const maxDay = Math.max(1, ...days.map((day) => day.count));
  const firstName = user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there";

  return (
    <>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-accent-deep"><DashboardIcon className="h-4 w-4" /> Workspace overview</p>
            <h1 className="font-serif text-3xl text-ink sm:text-4xl">Good to see you, {firstName}</h1>
            <p className="mt-2 text-sm text-ink-soft">Here&rsquo;s what&rsquo;s happening with your email today.</p>
          </div>
          <Link href="/compose" className="btn-primary"><SendIcon className="h-4 w-4" /> Compose email</Link>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Successfully sent", value: sentTotal, Icon: CheckIcon, note: "All time", tone: "text-accent-deep bg-accent-soft" },
            { label: "Failed attempts", value: failedTotal, Icon: AlertIcon, note: "All time", tone: "text-amber bg-amber-soft" },
            { label: "Connected accounts", value: accounts.length, Icon: UsersIcon, note: "Gmail and Outlook", tone: "text-violet-700 bg-violet-50" },
            { label: "Total attempts", value: sentTotal + failedTotal, Icon: SendIcon, note: "All time", tone: "text-indigo-700 bg-indigo-50" },
          ].map(({ label, value, Icon, note, tone }) => (
            <section key={label} className="card p-5">
              <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-ink-soft">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span></div>
              <p className="mt-4 font-serif text-3xl text-ink">{value.toLocaleString()}</p>
              <p className="mt-1 text-xs text-ink-soft">{note}</p>
            </section>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="card p-5 sm:p-6" aria-labelledby="activity-title">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><h2 id="activity-title" className="font-serif text-xl text-ink">Sending activity</h2><p className="mt-1 text-sm text-ink-soft">Email attempts over the last seven days</p></div>
              <Link href="/sent" className="btn-ghost min-h-9 px-3 text-xs">View history</Link>
            </div>
            <div className="flex h-48 items-end gap-2 border-b border-line px-1 pb-2 sm:gap-4">
              {days.map((day) => (
                <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2" aria-label={`${day.count} attempts on ${day.key}`}>
                  <span className="text-[11px] font-medium text-ink-soft">{day.count || ""}</span>
                  <div className="w-full max-w-12 rounded-t-lg bg-accent/80 transition-[height]" style={{ height: `${day.count ? Math.max(10, (day.count / maxDay) * 118) : 3}px` }} />
                  <span className="text-[11px] text-ink-soft">{day.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-ink-soft"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Individual send attempts</div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="mailboxes-title">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="mailboxes-title" className="font-serif text-xl text-ink">Mailboxes</h2><p className="mt-1 text-sm text-ink-soft">Accounts ready to send</p></div><Link href="/settings#accounts" className="text-xs font-medium text-accent-deep hover:underline">Manage</Link></div>
            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center"><UsersIcon className="mx-auto h-6 w-6 text-ink-soft" /><p className="mt-3 text-sm text-ink">No mailboxes connected</p><Link href="/settings#accounts" className="btn-secondary mt-4 min-h-10 px-3 text-xs">Connect an account</Link></div>
            ) : (
              <ul className="space-y-2">{accounts.slice(0, 4).map((account) => <li key={account.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-semibold text-accent-deep shadow-sm">{account.provider === "google" ? "G" : "O"}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{account.email}</span><span className="text-xs text-ink-soft">{account.provider === "google" ? "Gmail" : "Outlook"}</span></span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${account.needs_reconnect ? "bg-amber" : "bg-emerald-500"}`} title={account.needs_reconnect ? "Reconnect needed" : "Connected"} />
              </li>)}</ul>
            )}
            {accounts.length > 4 && <p className="mt-3 text-xs text-ink-soft">And {accounts.length - 4} more connected accounts</p>}
          </section>

          <section className="card overflow-hidden xl:col-span-2" aria-labelledby="recent-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6"><div><h2 id="recent-title" className="font-serif text-xl text-ink">Recent email activity</h2><p className="mt-1 text-sm text-ink-soft">Latest messages sent from Outbox</p></div><Link href="/sent" className="btn-secondary min-h-9 px-3 text-xs">Open sent history</Link></div>
            {recentRows.length === 0 ? (
              <div className="px-5 py-12 text-center"><SendIcon className="mx-auto h-6 w-6 text-ink-soft" /><p className="mt-3 text-sm font-medium text-ink">Your activity will appear here</p><p className="mt-1 text-sm text-ink-soft">Compose your first email to get started.</p><Link href="/compose" className="btn-primary mt-4 min-h-10 px-3 text-xs">Compose email</Link></div>
            ) : (
              <ul className="divide-y divide-line">{recentRows.map((row) => {
                const ok = row.status === "sent";
                return <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ok ? "bg-accent-soft text-accent-deep" : "bg-amber-soft text-amber"}`}>{ok ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{row.subject || "(No subject)"}</p><p className="mt-0.5 truncate text-xs text-ink-soft">{row.from_email} <span className="px-1">to</span> {row.to_email}</p></div>
                  <span className={`pill ${ok ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-amber/20 bg-amber-soft text-amber"}`}>{ok ? "Sent" : "Failed"}</span>
                  <span className="w-24 text-right text-xs text-ink-soft"><LocalTime iso={row.sent_at} /></span>
                </li>;
              })}</ul>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
