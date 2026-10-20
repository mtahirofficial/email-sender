import Link from "next/link";
import type { BlogPostSummary } from "@/lib/blog";
import { formatDate } from "@/lib/blog";

export default function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <article className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      <Link href={`/blog/${post.slug}`} className="flex flex-1 flex-col" aria-label={post.title}>
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.cover_alt ?? ""}
            width={1200}
            height={630}
            loading="lazy"
            decoding="async"
            className="aspect-[1200/630] w-full object-cover"
          />
        ) : (
          <div className="airmail aspect-[1200/630] w-full opacity-90" aria-hidden="true" />
        )}
        <div className="flex flex-1 flex-col p-5">
          {post.tags.length > 0 && (
            <p className="mb-2 flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="pill border-accent/20 bg-accent-soft text-accent-deep">
                  {tag}
                </span>
              ))}
            </p>
          )}
          <h2 className="font-serif text-xl leading-snug text-ink group-hover:text-accent-deep">{post.title}</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{post.excerpt}</p>
          <p className="mt-4 text-xs text-ink-soft">
            <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
          </p>
        </div>
      </Link>
    </article>
  );
}
