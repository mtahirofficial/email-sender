import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Private screens stay crawlable on purpose so Google can read their
// `noindex` tag; only API/OAuth/tracking endpoints are blocked outright.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/oauth/", "/email-test/track/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
