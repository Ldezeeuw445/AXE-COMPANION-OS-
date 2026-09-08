import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/siteUrl";

/** Public, crawlable routes only — the signed-in app is disallowed in robots.ts. */
const PUBLIC_ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/launch", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/login", priority: 0.5, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/risk-disclaimer", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/ai-disclaimer", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/cookies", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/refunds", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/subprocessors", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
