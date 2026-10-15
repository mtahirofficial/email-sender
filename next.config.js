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

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: noFraming },
      { source: "/login", headers: noFraming },
      { source: "/sent", headers: noFraming },
      { source: "/email-test", headers: noFraming },
    ];
  },
};

module.exports = nextConfig;
