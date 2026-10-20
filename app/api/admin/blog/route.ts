import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { dbErrorMessage } from "@/lib/db-error";
import { parsePostInput } from "@/lib/blog-input";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = parsePostInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const post = parsed.value;
  const { data, error } = await createAdminClient()
    .from("blog_posts")
    .insert({ ...post, published_at: post.status === "published" ? new Date().toISOString() : null })
    .select("id")
    .single();

  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "That slug is already used by another post." : dbErrorMessage(error, "Could not save the post") },
      { status: taken ? 409 : 500 }
    );
  }

  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ ok: true, id: data.id });
}
