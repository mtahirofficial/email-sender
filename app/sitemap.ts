import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

// Only public, indexable pages belong here.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = new Date("2026-10-15");
  const posts = await getPublishedPosts();

  return [
    { url: `${SITE_URL}/`, lastModified: updated, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: posts[0] ? new Date(posts[0].updated_at) : updated, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/contact`, lastModified: updated, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
  ];
}
