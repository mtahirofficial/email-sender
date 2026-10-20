import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { dbErrorMessage } from "@/lib/db-error";
import { parsePostInput } from "@/lib/blog-input";

const UUID = /^[0-9a-f-]{36}$/i;

function revalidateBlog(...slugs: (string | undefined)[]) {
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  for (const slug of slugs) if (slug) revalidatePath(`/blog/${slug}`);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = parsePostInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("blog_posts").select("slug, published_at").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const post = parsed.value;
  const { error } = await admin
    .from("blog_posts")
    .update({
      ...post,
      // first publish stamps the date; later edits keep it
      published_at: post.status === "published" ? existing.published_at ?? new Date().toISOString() : existing.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "That slug is already used by another post." : dbErrorMessage(error, "Could not save the post") },
      { status: taken ? 409 : 500 }
    );
  }

  revalidateBlog(existing.slug, post.slug);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("blog_posts").select("slug").eq("id", params.id).maybeSingle();
  const { error } = await admin.from("blog_posts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Could not delete the post." }, { status: 500 });

  revalidateBlog(existing?.slug);
  return NextResponse.json({ ok: true });
}
