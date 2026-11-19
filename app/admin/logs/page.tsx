import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { readAppErrorLogs } from "@/lib/error-log";
import SiteFooter from "@/components/marketing/SiteFooter";
import LocalTime from "@/components/LocalTime";

export const metadata: Metadata = { title: "Error logs", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminErrorLogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  const logs = await readAppErrorLogs();
  return (
    <>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Error logs</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">Recent application errors with request, response, and technical details. Sensitive request bodies and credentials are not stored.</p>
        {logs.length === 0 ? (
          <div className="card px-6 py-12 text-center text-sm text-ink-soft">No errors have been recorded.</div>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-ink">{log.response.message}</p>
                    <p className="mt-1 text-xs text-ink-soft">{log.request.method} {log.request.path} · HTTP {log.response.status}{log.request.userId ? ` · User ${log.request.userId}` : ""}</p>
                  </div>
                  <p className="shrink-0 text-xs text-ink-soft"><LocalTime iso={log.time} seconds /></p>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-accent-deep">Technical details</summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-ink-soft">{JSON.stringify(log, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
