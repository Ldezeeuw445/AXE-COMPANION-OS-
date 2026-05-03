import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    "*.riker.replit.dev",
    "*.replit.dev",
  ].filter(Boolean),
  turbopack: {
    resolveAlias: {
      "...": "./public/empty.js",
    },
  },
};

export default nextConfig;
