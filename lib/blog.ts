import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string | null;
  cover_alt: string | null;
  tags: string[];
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BlogPostSummary = Omit<BlogPost, "content">;

const LIST_FIELDS =
  "id, slug, title, excerpt, cover_image, cover_alt, tags, status, published_at, created_at, updated_at";

/** Cookie-less client for public reads; row-level security exposes published posts only. */
function publicClient() {
  return createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getPublishedPosts(): Promise<BlogPostSummary[]> {
  try {
    const { data, error } = await publicClient()
      .from("blog_posts")
      .select(LIST_FIELDS)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as BlogPostSummary[];
  } catch (err) {
    console.error("blog: could not load posts", err);
    return [];
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    const { data, error } = await publicClient()
      .from("blog_posts")
      .select(`${LIST_FIELDS}, content`)
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return (data as BlogPost | null) ?? null;
  } catch (err) {
    console.error("blog: could not load post", err);
    return null;
  }
}

// ---- admin (service role; callers must have verified the admin first) ----

export async function adminListPosts(): Promise<BlogPostSummary[]> {
  const { data, error } = await createAdminClient()
    .from("blog_posts")
    .select(LIST_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlogPostSummary[];
}

export async function adminGetPost(id: string): Promise<BlogPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await createAdminClient().from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as BlogPost | null) ?? null;
}

export function readingMinutes(content: string) {
  return Math.max(1, Math.round(content.split(/\s+/).filter(Boolean).length / 200));
}

export function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
