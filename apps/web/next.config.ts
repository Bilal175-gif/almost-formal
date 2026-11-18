import type { NextConfig } from "next";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4100";
if (process.env.CF_WORKERS === "1" && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiUrl)) {
  throw new Error("Cloudflare build requires API_URL to be a reachable HTTPS Node API origin.");
}
const config: NextConfig = {
  distDir: process.env.NODE_ENV === "development"
    ? `.next-dev-${process.env.WEB_PORT || "3000"}`
    : ".next",
  experimental: {
    agentUpgrade: "security",
  },
  poweredByHeader: false,
  devIndicators: false,
  images: {
    remotePatterns: cloudName
      ? [{ protocol: "https", hostname: "res.cloudinary.com", pathname: `/${cloudName}/image/upload/**` }]
      : [],
  },
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};
export default config;
