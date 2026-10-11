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
      // /courses/:slug, /bundles/:slug, /pages/*, /users/sign_in and /users/sign_up keep the same paths.
      { source: "/collections", destination: "/pages/paid-courses", permanent: true },
      { source: "/collections/:path*", destination: "/pages/paid-courses", permanent: true },
      { source: "/courses", destination: "/pages/paid-courses", permanent: true },
      // course player: students resume where they left off
      { source: "/courses/take/:slug", destination: "/learn/:slug", permanent: false },
      { source: "/courses/take/:slug/:rest*", destination: "/learn/:slug", permanent: false },
      { source: "/enrollments", destination: "/dashboard", permanent: true },
      { source: "/enrollments/:path*", destination: "/dashboard", permanent: true },
      { source: "/account", destination: "/dashboard/settings", permanent: true },
      { source: "/account/orders", destination: "/dashboard/purchases", permanent: true },
      { source: "/account/:path*", destination: "/dashboard/settings", permanent: true },
      { source: "/users/edit", destination: "/dashboard/settings", permanent: true },
      // old Thinkific reset links (and our earlier URL) go to the reset page
      { source: "/users/password", destination: "/users/reset-password", permanent: false },
      { source: "/users/password/:path+", destination: "/users/reset-password", permanent: false },
      { source: "/users/sign_out", destination: "/", permanent: false },
      // old checkout links (/order?ct=…) go to the catalogue; prices and gateways changed
      { source: "/order", destination: "/pages/paid-courses", permanent: false },
      { source: "/order/:path*", destination: "/pages/paid-courses", permanent: false },
      // Thinkific admin
      { source: "/manage", destination: "/admin", permanent: false },
      { source: "/manage/:path*", destination: "/admin", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
