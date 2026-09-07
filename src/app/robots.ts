import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/siteUrl";

/**
 * Everything behind auth is worthless to a crawler and leaks route structure,
 * so only the marketing and legal surface is indexable. The signed-in app lives
 * under routes that all redirect to /login for anonymous visitors anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/chat",
        "/chart",
        "/cockpit",
        "/alerts",
        "/accounts",
        "/positions",
        "/journal",
        "/vault",
        "/wallets",
        "/watchlist",
        "/history",
        "/intel",
        "/market",
        "/feed",
        "/settings",
        "/onboarding",
        "/upgrade",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
