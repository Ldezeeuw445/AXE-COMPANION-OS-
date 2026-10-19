import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The MT5 connect form can carry a broker's `servers.dat`, the file that
      // registers a broker MetaApi does not know yet. Default is 1MB, and the
      // app refuses anything over 2MB with a readable reason — so the limit is
      // 3mb to leave room for multipart boundaries and part headers, which the
      // raw body counts too. Without this a slightly large file fails at the
      // framework with a message nobody can act on.
      bodySizeLimit: "3mb",
    },
  },
  typescript: {
    // Was `ignoreBuildErrors: true` as "a temporary measure", and it stayed on
    // long enough to hide 89 type errors — two of which were live runtime bugs
    // in /api/risk/band, and 43 of which were a Doctor action whose helpers had
    // never been written. All are fixed; the build now fails on a type error
    // again, which is the point.
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  turbopack: {
    root: rootDir,
  },
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    "*.riker.replit.dev",
    "*.replit.dev",
  ].filter(Boolean),
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/legal/terms", destination: "/terms", permanent: true },
      { source: "/legal/privacy", destination: "/privacy", permanent: true },
      { source: "/legal/risk", destination: "/risk-disclaimer", permanent: true },
      { source: "/legal/ai-disclaimer", destination: "/ai-disclaimer", permanent: true },
      { source: "/legal/cookies", destination: "/cookies", permanent: true },
      { source: "/legal/refunds", destination: "/refunds", permanent: true },
      { source: "/legal/subprocessors", destination: "/subprocessors", permanent: true },
      { source: "/legal/contact", destination: "/contact", permanent: true },
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
