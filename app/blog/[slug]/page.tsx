import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import GetStartedLink from "@/components/GetStartedLink";
import SiteFooter from "@/components/marketing/SiteFooter";
import PostCard from "@/components/blog/PostCard";
import Prose from "@/components/blog/Prose";
import JsonLd from "@/components/JsonLd";
import { formatDate, getPublishedPost, getPublishedPosts, readingMinutes } from "@/lib/blog";
import { ORG_ID, breadcrumbNode, graph, organizationNode, websiteNode } from "@/lib/jsonld";
import { renderMarkdown } from "@/lib/markdown";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublishedPost(params.slug);
  if (!post) return { title: "Article not found", robots: { index: false } };

  const image = post.cover_image ? { url: post.cover_image, alt: post.cover_alt ?? post.title } : OG_IMAGE;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.excerpt,
      siteName: SITE_NAME,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      tags: post.tags,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.excerpt, images: [image.url] },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const [post, all] = await Promise.all([getPublishedPost(params.slug), getPublishedPosts()]);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${post.slug}`;
  const related = all.filter((p) => p.slug !== post.slug).slice(0, 2);
  const minutes = readingMinutes(post.content);

  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: post.title,
      description: post.excerpt,
      image: [`${SITE_URL}${post.cover_image ?? OG_IMAGE.url}`],
      datePublished: post.published_at,
      dateModified: post.updated_at,
      keywords: post.tags.join(", "),
      wordCount: post.content.split(/\s+/).filter(Boolean).length,
      inLanguage: "en",
      author: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
    },
    breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ])
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <main id="main" className="mx-auto w-full flex-1 max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
          <Link href="/" className="hover:text-ink">Home</Link> / <Link href="/blog" className="hover:text-ink">Blog</Link>
        </nav>

        <article>
          <header>
            {post.tags.length > 0 && (
              <p className="mb-4 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="pill border-accent/20 bg-accent-soft text-accent-deep">{tag}</span>
                ))}
              </p>
            )}
            <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">{post.title}</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">{post.excerpt}</p>
            <p className="mt-4 text-sm text-ink-soft">
              By {SITE_NAME} Team · <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time> · {minutes} min read
            </p>
          </header>

          {post.cover_image && (
            <img
              src={post.cover_image}
              alt={post.cover_alt ?? post.title}
              width={1200}
              height={630}
              decoding="async"
              className="mt-8 aspect-[1200/630] w-full rounded-2xl object-cover"
            />
          )}

          <div className="mt-8">
            <Prose html={renderMarkdown(post.content)} />
          </div>
        </article>

        <aside className="relative mt-12 overflow-hidden rounded-2xl bg-accent-deep px-6 py-8 text-white">
          <div className="airmail absolute inset-x-0 top-0 h-2" aria-hidden="true" />
          <h2 className="font-serif text-2xl">Send email from your own address</h2>
          <p className="mt-2 text-white/80">Connect Gmail or Outlook with send-only access and send individual emails in minutes.</p>
          <GetStartedLink className="btn-secondary mt-5" />
        </aside>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-14">
            <h2 id="related-heading" className="font-serif text-2xl text-ink">Keep reading</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              {related.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
