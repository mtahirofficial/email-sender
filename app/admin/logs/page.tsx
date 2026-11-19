import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { readAppErrorLogs } from "@/lib/error-log";
import SiteFooter from "@/components/marketing/SiteFooter";
import ErrorLogsList from "@/components/admin/ErrorLogsList";

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
        <p className="mb-6 mt-1 text-sm text-ink-soft">The latest 100 application errors, with request, response, and technical details. Sensitive request bodies and credentials are not stored.</p>
        <ErrorLogsList initialLogs={logs} />
      </main>
      <SiteFooter />
    </>
  );
}
