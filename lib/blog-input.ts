// Pure helpers shared by the editor (browser) and the API routes (server).

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export type PostInput = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string | null;
  cover_alt: string | null;
  tags: string[];
  status: "draft" | "published";
};

export function parsePostInput(body: unknown): { ok: true; value: PostInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const title = str(b.title);
  const slug = str(b.slug);
  const excerpt = str(b.excerpt);
  const content = typeof b.content === "string" ? b.content.trim() : "";
  const cover = str(b.cover_image);
  const coverAlt = str(b.cover_alt);
  const status = b.status === "published" ? "published" : "draft";
  const tags = (Array.isArray(b.tags) ? b.tags : [])
    .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
    .filter(Boolean);

  if (title.length < 3 || title.length > 120) return { ok: false, error: "Title must be 3 to 120 characters." };
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return { ok: false, error: "Slug may only use lowercase letters, numbers and hyphens." };
  if (excerpt.length < 20 || excerpt.length > 200) return { ok: false, error: "Description must be 20 to 200 characters (aim for 160 or less)." };
  if (!content) return { ok: false, error: "Content can't be empty." };
  if (cover && !/^(\/images\/[\w.-]+|https:\/\/\S+)$/.test(cover)) return { ok: false, error: "Cover image must be an uploaded image or an https URL." };
  if (tags.length > 8 || tags.some((t) => t.length > 30)) return { ok: false, error: "Use at most 8 tags, each up to 30 characters." };

  return {
    ok: true,
    value: { title, slug, excerpt, content, cover_image: cover || null, cover_alt: coverAlt || null, tags: Array.from(new Set(tags)), status },
  };
}
