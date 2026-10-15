import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only public, indexable pages belong here.
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-10-15");
  return [
    { url: `${SITE_URL}/`, lastModified: updated, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
  ];
}
