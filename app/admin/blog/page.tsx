import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { adminListPosts } from "@/lib/blog";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import { toHeaderUser } from "@/lib/header-user";
import LocalTime from "@/components/LocalTime";
import SeedStarterPosts from "@/components/admin/SeedStarterPosts";
import { PlusIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Blog manager", robots: { index: false, follow: false } };

export default async function AdminBlogPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) notFound();

  let posts: Awaited<ReturnType<typeof adminListPosts>> = [];
  let loadError = false;
  try {
    posts = await adminListPosts();
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <>
      <SiteHeader initialUser={toHeaderUser(user)} />
      <main id="main" className="mx-auto w-full flex-1 max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-ink">Blog manager</h1>
            <p className="mt-1 text-sm text-ink-soft">Write, publish and edit articles. Only you can see this page.</p>
          </div>
          <Link href="/admin/blog/new" className="btn-primary">
            <PlusIcon className="h-4 w-4" /> New post
          </Link>
        </div>

        {loadError && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load posts. Run supabase/migrations_add_blog.sql in the Supabase SQL Editor first.
          </p>
        )}

        <div className="mb-6">
          <SeedStarterPosts />
        </div>

        {posts.length === 0 ? (
          <div className="card px-6 py-12 text-center text-sm text-ink-soft">No posts yet. Create one or install the starter articles.</div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/blog/${post.id}`} className="block truncate font-medium text-ink hover:text-accent-deep">
                    {post.title}
                  </Link>
                  <p className="truncate text-xs text-ink-soft">
                    /blog/{post.slug} · updated <LocalTime iso={post.updated_at} dateOnly />
                  </p>
                </div>
                <span
                  className={`pill ${post.status === "published" ? "border-accent/20 bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft"}`}
                >
                  {post.status === "published" ? "Published" : "Draft"}
                </span>
                <Link href={`/admin/blog/${post.id}`} className="btn-secondary min-h-[40px] px-3">Edit</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
