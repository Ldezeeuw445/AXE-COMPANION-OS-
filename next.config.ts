import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Stamp the build with the commit it was built from.
 *
 * Without this, "is my fix live?" has no answer. Twice in one session the
 * deploy was reasoned about instead of measured: once assuming an autodeploy
 * cron existed on the VPS when none ever had, and once assuming the box
 * tracked the `deployed` branch when it was on `main` — the runbook said
 * otherwise and the runbook was wrong. Four pushes reached nobody and nothing
 * said so. `/api/debug/build` now answers it in one request.
 *
 * Read at build time, not runtime: the running server has no reason to shell
 * out to git, and on a host without a checkout it could not anyway.
 */
function gitStamp(): { commit: string; branch: string } {
  const run = (args: string[]): string => {
    try {
      return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // No git, no checkout, or a shallow clone without refs. An unknown
      // commit is a usable answer; a failed build is not.
      return "";
    }
  };
  return {
    commit: process.env.AXE_BUILD_COMMIT || run(["rev-parse", "HEAD"]),
    branch: process.env.AXE_BUILD_BRANCH || run(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

const stamp = gitStamp();

const nextConfig: NextConfig = {
  env: {
    AXE_BUILD_COMMIT: stamp.commit,
    AXE_BUILD_BRANCH: stamp.branch,
    AXE_BUILD_TIME: new Date().toISOString(),
  },
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
      { source: "/landing/index.html", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
