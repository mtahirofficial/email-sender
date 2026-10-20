import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { toHeaderUser } from "@/lib/header-user";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import MessagesList, { type ContactMessage } from "@/components/admin/MessagesList";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function AdminMessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  const { data, error } = await createAdminClient()
    .from("contact_messages")
    .select("id, name, email, subject, message, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("messages: could not load", error);

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl text-ink">Messages</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">Messages sent through the contact form. Only you can see this page.</p>
        {error && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load messages. Run supabase/migrations_add_account_contact.sql in the Supabase SQL Editor first.
          </p>
        )}
        <MessagesList messages={(data ?? []) as ContactMessage[]} />
      </main>
      <SiteFooter />
    </>
  );
}
