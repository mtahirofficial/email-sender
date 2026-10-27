import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { toHeaderUser } from "@/lib/header-user";
import { getHeartbeat, isHeartbeatFresh } from "@/lib/scheduler";
import { SITE_URL } from "@/lib/site";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import CopyBlock from "@/components/admin/CopyBlock";
import LocalTime from "@/components/LocalTime";

export const metadata: Metadata = { title: "Scheduler", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SchedulerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  const lastTickAt = await getHeartbeat(createAdminClient()).catch(() => null);
  const active = isHeartbeatFresh(lastTickAt);
  const secretSet = Boolean(process.env.CRON_SECRET);

  const command = `curl -s -m 55 -H "Authorization: Bearer PASTE_YOUR_CRON_SECRET" "${SITE_URL}/api/cron/automation" > /dev/null`;
  const urlOnly = `curl -s -m 55 "${SITE_URL}/api/cron/automation?key=PASTE_YOUR_CRON_SECRET" > /dev/null`;

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Background scheduler</h1>
        <p className="mb-6 mt-1 text-sm leading-relaxed text-ink-soft">
          This makes the daily automation run with every computer switched off. A Hostinger cron job calls your app every 5 minutes; the app
          writes today&rsquo;s emails at each user&rsquo;s chosen time and sends the ones that are due. The calls also keep the app awake.
        </p>

        <section className="card mb-6 p-5">
          <h2 className="mb-3 font-serif text-xl text-ink">Status</h2>
          <ul className="space-y-2 text-sm">
            <li className={secretSet ? "text-accent-deep" : "text-red-700"}>
              {secretSet ? "CRON_SECRET is set in the app." : "CRON_SECRET is not set. Add it to the app's environment variables in hPanel (any long random text), then redeploy."}
            </li>
            <li className={active ? "text-accent-deep" : "text-amber"}>
              {active ? (
                <>Running. Last call received <LocalTime iso={lastTickAt as string} seconds />.</>
              ) : lastTickAt ? (
                <>Not running right now. Last call was <LocalTime iso={lastTickAt} seconds />.</>
              ) : (
                "No call received yet. Finish the steps below, then wait up to 5 minutes and refresh this page."
              )}
            </li>
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-serif text-xl text-ink">One-time setup on Hostinger</h2>
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
            <li>Run <code>supabase/migrations_add_scheduler_heartbeat.sql</code> in the Supabase SQL Editor.</li>
            <li>In hPanel, open your website, then Environment variables. Add <code>CRON_SECRET</code> (a long random text) and redeploy or restart the app.</li>
            <li>In hPanel open <strong>Advanced, then Cron Jobs</strong> and add a job that runs every 5 minutes (<code>*/5 * * * *</code>).</li>
            <li>
              Use the command below as the job&rsquo;s command, replacing <code>PASTE_YOUR_CRON_SECRET</code> with the same text. Cron jobs do not receive
              the app&rsquo;s environment variables, so the secret has to be written into the command itself.
            </li>
            <li>Wait up to 5 minutes and refresh this page. The status above turns green.</li>
          </ol>
          <CopyBlock text={command} />
          <p className="mb-2 mt-4 text-xs text-ink-soft">If the cron field only works with a plain web address, use this version instead (the secret may then appear in server logs):</p>
          <CopyBlock text={urlOnly} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
