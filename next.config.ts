import type { NextConfig } from "next";

/**
 * The actual application is a Vanilla-JS static site living in `public/`.
 * This config only serves it locally with clean, production-like URLs
 * (mirroring the Cloudflare Pages `_redirects` rules in public/_redirects).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/login", destination: "/login.html" },
        { source: "/admin", destination: "/admin.html" },
        { source: "/superadmin", destination: "/superadmin.html" },
        { source: "/qr-print", destination: "/qr-print.html" },
        { source: "/cafe/:slug", destination: "/cafe.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
