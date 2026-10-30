import type { NextConfig } from "next";

// Baseline security headers (spec §8.2). Paddle checkout runs in its own
// iframe, so pages only restrict who may frame *us*.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const pagePolicyHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (Dockerfile, target "web").
  output: "standalone",
  poweredByHeader: false,
  headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Config headers override a route's own, so these skip the report routes (/r/…, /api/reports/…),
      // which send a stricter CSP and Referrer-Policy: no-referrer themselves (lib/reports/serve.ts).
      { source: "/((?!r/|api/reports/).*)", headers: pagePolicyHeaders },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
