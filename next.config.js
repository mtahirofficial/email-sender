/** @type {import('next').NextConfig} */

// Safe, broadly applicable security headers (also counted by Lighthouse
// "Best Practices"). Deliberately no strict CSP: it would need tuning against
// Next's inline scripts and could break pages.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Signed-in app screens must never be framed by another site (clickjacking).
const noFraming = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Blog images live in Supabase Storage but are served from our own domain
  // as /images/<file>. Uploaded names are unique and never overwritten, so
  // they can be cached forever.
  async rewrites() {
    if (!supabaseUrl) return [];
    return [
      {
        source: "/images/:name",
        destination: `${supabaseUrl}/storage/v1/object/public/blog-images/:name`,
      },
      {
        source: "/avatars/:name",
        destination: `${supabaseUrl}/storage/v1/object/public/avatars/:name`,
      },
    ];
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/images/:name", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/avatars/:name", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/login", headers: noFraming },
      { source: "/compose", headers: noFraming },
      { source: "/settings", headers: noFraming },
      { source: "/sent", headers: noFraming },
      { source: "/email-test", headers: noFraming },
      { source: "/admin/:path*", headers: noFraming },
    ];
  },
};

module.exports = nextConfig;
