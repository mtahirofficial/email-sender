"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BlogPost } from "@/lib/blog";
import { slugify } from "@/lib/blog-input";
import { renderMarkdown } from "@/lib/markdown";
import Prose from "@/components/blog/Prose";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";

export default function PostEditor({ post }: { post?: BlogPost }) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [cover, setCover] = useState(post?.cover_image ?? "");
  const [coverAlt, setCoverAlt] = useState(post?.cover_alt ?? "");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [status, setStatus] = useState<"draft" | "published">(post?.status ?? "draft");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  function onTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    setNotice(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setNotice({ ok: false, text: data.error ?? "Upload failed." });
      return null;
    }
    return data.url as string;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    const payload = {
      title,
      slug,
      excerpt,
      content,
      cover_image: cover,
      cover_alt: coverAlt,
      tags: tags.split(","),
      status,
    };
    const res = await fetch(post ? `/api/admin/blog/${post.id}` : "/api/admin/blog", {
      method: post ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setNotice({ ok: false, text: data.error ?? "Could not save." });
      return;
    }
    setNotice({ ok: true, text: status === "published" ? "Saved and published." : "Saved as draft." });
    if (post) router.refresh();
    else router.replace(`/admin/blog/${data.id}`);
  }

  async function remove() {
    if (!post || !window.confirm("Delete this post permanently?")) return;
    const res = await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/blog");
    else setNotice({ ok: false, text: "Could not delete the post." });
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="card space-y-5 p-5 sm:p-6">
        <div>
          <label htmlFor="title" className="label">Title</label>
          <input id="title" required value={title} onChange={(e) => onTitle(e.target.value)} className="input" />
        </div>

        <div>
          <label htmlFor="slug" className="label">URL slug</label>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-soft sm:inline">/blog/</span>
            <input
              id="slug"
              required
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="excerpt" className="label">
            Meta description <span className="font-normal text-ink-soft">({excerpt.length}/160 recommended)</span>
          </label>
          <textarea id="excerpt" required rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="input resize-y" />
        </div>

        <div>
          <label htmlFor="tags" className="label">Tags <span className="font-normal text-ink-soft">(comma separated)</span></label>
          <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} className="input" placeholder="deliverability, gmail" />
        </div>
      </div>

      <div className="card space-y-4 p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink">Cover image</h2>
        {cover && (
          <img src={cover} alt={coverAlt || "Cover preview"} className="aspect-[1200/630] w-full max-w-md rounded-xl border border-line object-cover" />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            {uploading && <SpinnerIcon />} {cover ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) { const url = await upload(file); if (url) setCover(url); }
              }}
            />
          </label>
          {cover && <button type="button" onClick={() => setCover("")} className="btn-ghost">Remove</button>}
        </div>
        {cover && <p className="break-all text-xs text-ink-soft">{cover}</p>}
        <div>
          <label htmlFor="cover-alt" className="label">Image alt text</label>
          <input id="cover-alt" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} className="input" placeholder="Describe the image for screen readers and SEO" />
        </div>
        <p className="text-xs text-ink-soft">JPG, PNG, WebP or GIF up to 4 MB. Recommended size 1200 × 630. Served publicly at /images/&lt;file name&gt;.</p>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Editor mode" className="inline-flex gap-1 rounded-lg bg-mist p-1 text-sm">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-[40px] rounded-md px-4 capitalize ${tab === t ? "bg-white font-medium text-ink shadow-sm" : "text-ink-soft"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="btn-ghost cursor-pointer text-xs">
            {uploading && <SpinnerIcon />} Insert image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const url = await upload(file);
                if (url) setContent((c) => `${c}${c.endsWith("\n") || !c ? "" : "\n"}\n![Describe this image](${url})\n`);
              }}
            />
          </label>
        </div>

        {tab === "write" ? (
          <>
            <label htmlFor="content" className="sr-only">Content (Markdown)</label>
            <textarea
              id="content"
              required
              rows={22}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input resize-y font-mono text-[13px] leading-6"
              placeholder={"## A heading\n\nWrite in Markdown. **Bold**, *italic*, [links](https://example.com), lists, > quotes and ![images](/images/file.jpg) are supported."}
            />
          </>
        ) : (
          <div className="min-h-[200px] rounded-lg border border-line bg-white p-5">
            {content.trim() ? <Prose html={renderMarkdown(content)} /> : <p className="text-sm text-ink-soft">Nothing to preview yet.</p>}
          </div>
        )}
      </div>

      <div className="card sticky bottom-3 flex flex-wrap items-center gap-3 p-4">
        <label htmlFor="status" className="sr-only">Status</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")} className="input w-auto">
          <option value="draft">Draft (hidden)</option>
          <option value="published">Published</option>
        </select>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving && <SpinnerIcon />} {post ? "Save changes" : "Create post"}
        </button>
        {post && status === "published" && (
          <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="btn-ghost">View live</a>
        )}
        {post && <button type="button" onClick={remove} className="btn-ghost ml-auto text-red-700 hover:text-red-800">Delete</button>}
        <div aria-live="polite" className="basis-full text-sm">
          {notice && (
            <p className={`flex items-center gap-2 ${notice.ok ? "text-accent-deep" : "text-red-700"}`}>
              {notice.ok ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />} {notice.text}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
