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
        // Retired draft landings. They 308 to "/" now, but a crawler should
        // not spend budget discovering that, and an indexed redirect is still
        // a second URL competing for the same page.
        "/launch",
        "/final",
        "/finallaunch",
        "/ui-premium",
        // Internal screenshot/poster tooling and the PWA install helper:
        // useful by link, pointless in search results.
        "/marketing",
        "/welcome",
        // Public demo entry: useful to hand out by link, pointless in search
        // results, and it signs a visitor straight into a shared account.
        "/demo",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
