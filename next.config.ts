import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Keep Thinkific URLs working after the switch so links and SEO aren't lost.
  async redirects() {
    return [
      { source: "/collections", destination: "/pages/paid-courses", permanent: true },
      { source: "/courses/take/:slug/:rest*", destination: "/learn/:slug", permanent: false },
      { source: "/enrollments", destination: "/dashboard", permanent: true },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
