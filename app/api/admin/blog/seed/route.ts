import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { dbErrorMessage } from "@/lib/db-error";
import { STARTER_POSTS } from "@/content/starter-posts";

// Installs the bundled starter articles. Safe to run repeatedly: missing ones
// are added, ones you have never edited are refreshed to the latest text, and
// anything you changed in the manager is left alone.
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("blog_posts")
    .select("slug, created_at, updated_at")
    .in("slug", STARTER_POSTS.map((p) => p.slug));
  if (readError) {
    console.error("blog seed: read failed", readError);
    return NextResponse.json(
      { error: `Could not read the blog table (${readError.message}). Did you run supabase/migrations_add_blog.sql?` },
      { status: 500 }
    );
  }

  const have = new Map((existing ?? []).map((p) => [p.slug as string, p]));
  const day = 24 * 60 * 60 * 1000;

  const rows = STARTER_POSTS.filter((p) => !have.has(p.slug)).map((p, index) => ({
    ...p,
    cover_image: null,
    cover_alt: null,
    status: "published",
    // stagger dates so the blog does not look like it was all written in one minute
    published_at: new Date(Date.now() - (index + 1) * 3 * day).toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await admin.from("blog_posts").insert(rows);
    if (error) {
      console.error("blog seed: insert failed", error);
      return NextResponse.json({ error: dbErrorMessage(error, "Could not install the articles") }, { status: 500 });
    }
  }

  // Never edited in the manager = updated_at still equals created_at.
  let refreshed = 0;
  for (const post of STARTER_POSTS) {
    const row = have.get(post.slug);
    if (!row || row.created_at !== row.updated_at) continue;
    const { error } = await admin
      .from("blog_posts")
      .update({ title: post.title, excerpt: post.excerpt, tags: post.tags, content: post.content })
      .eq("slug", post.slug);
    if (!error) {
      refreshed++;
      revalidatePath(`/blog/${post.slug}`);
    }
  }

  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ ok: true, added: rows.length, refreshed, skipped: have.size - refreshed });
}
