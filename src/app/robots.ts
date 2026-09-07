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
        // Working drafts and scaffolding that are still publicly reachable.
        // Kept live because which landing page wins is a product decision, but
        // they must not compete with /launch in search results.
        "/final",
        "/finallaunch",
        "/welcome",
        "/marketing",
        "/ui-premium",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
