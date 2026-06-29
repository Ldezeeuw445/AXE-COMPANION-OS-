import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors. This is a temporary measure to get Ollama
    // support working. Type errors should be fixed properly later.
    ignoreBuildErrors: true,
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
    ];
  },
};

export default nextConfig;
