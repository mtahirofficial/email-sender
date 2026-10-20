import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import { toHeaderUser } from "@/lib/header-user";
import PostEditor from "@/components/admin/PostEditor";

export const metadata: Metadata = { title: "New post", robots: { index: false, follow: false } };

export default async function NewPostPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full flex-1 max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-6 font-serif text-3xl text-ink">New post</h1>
        <PostEditor />
      </main>
      <SiteFooter />
    </>
  );
}
