import { normalizePublicAppBaseUrl } from "@/lib/env";

/**
 * Canonical public origin, for metadata routes that must emit absolute URLs.
 *
 * Production runs on a VPS behind nginx, so there is no platform-provided URL
 * env to lean on — NEXT_PUBLIC_APP_URL is the one the deployment already sets,
 * with the live hostname as the fallback so robots.txt and sitemap.xml never
 * emit localhost. Apex hosts are rewritten to www.
 */
const FALLBACK_ORIGIN = "https://www.axecompanion.com";

export function siteUrl(): string {
  return normalizePublicAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL, FALLBACK_ORIGIN);
}
