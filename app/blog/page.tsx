import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import PostCard from "@/components/blog/PostCard";
import JsonLd from "@/components/JsonLd";
import { getPublishedPosts } from "@/lib/blog";
import { breadcrumbNode, graph, organizationNode, webPageNode, websiteNode } from "@/lib/jsonld";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 3600;

const title = "Email Tips, Deliverability and Sending Guides";
const description =
  "Practical guides on sending email from your own address, avoiding spam folders, Gmail and Outlook limits, and writing messages people open.";

export const metadata: Metadata = {
  title: "Blog",
  description,
  alternates: { canonical: "/blog" },
  openGraph: { type: "website", url: "/blog", title: `Blog | ${SITE_NAME}`, description, siteName: SITE_NAME, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: `Blog | ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({ path: "/blog", name: title, description, type: "CollectionPage" }),
    {
      "@type": "Blog",
      "@id": `${SITE_URL}/blog#blog`,
      url: `${SITE_URL}/blog`,
      name: `${SITE_NAME} Blog`,
      description,
      publisher: { "@id": `${SITE_URL}/#organization` },
      blogPost: posts.slice(0, 10).map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        url: `${SITE_URL}/blog/${post.slug}`,
        datePublished: post.published_at,
      })),
    },
    breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
    ])
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <main id="main" className="mx-auto w-full flex-1 max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="font-serif text-4xl text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">{description}</p>
        </header>

        {posts.length === 0 ? (
          <p className="card mt-10 px-6 py-12 text-center text-ink-soft">No articles yet. Check back soon.</p>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
