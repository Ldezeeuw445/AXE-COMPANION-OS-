/**
 * Shared PWA cache policy. The service worker (`public/sw.js`) keeps a
 * matching allow/deny list — tests compare the two so they cannot drift.
 *
 * Safe = last-viewed shell + read-only GETs a trader can reopen offline.
 * Never cache cron, billing, or write endpoints.
 */

export const PWA_CACHE_VERSION = "axe-v5";
export const PWA_OFFLINE_PATH = "/offline";
export const PWA_START_URL = "/chat";

export const SAFE_NAV_PREFIXES = [
  "/chat",
  "/feed",
  "/intel",
  "/journal",
  "/chart",
  "/alerts",
  "/settings",
  "/cockpit",
  "/watchlist",
  "/positions",
  "/accounts",
  "/history",
  "/market",
  "/vault",
  "/actions",
  "/offline",
  "/onboarding",
] as const;

export const SAFE_API_PREFIXES = [
  "/api/feed",
  "/api/quotes",
  "/api/onboarding",
  "/api/intel",
  "/api/push/vapid",
  "/api/push/status",
] as const;

export const NEVER_CACHE_PREFIXES = [
  "/api/cron",
  "/api/billing",
  "/api/internal",
  "/api/stripe",
  "/api/checkout",
  "/api/tools",
  "/api/push/subscribe",
  "/api/push/send",
  "/auth",
] as const;

function pathnameOf(url: string): string {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new URL(url).pathname;
    }
  } catch {
    /* fall through */
  }
  const q = url.indexOf("?");
  const h = url.indexOf("#");
  const end = [q, h].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  return (end === undefined ? url : url.slice(0, end)) || "/";
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isSafeNavigation(url: string): boolean {
  const pathname = pathnameOf(url);
  if (pathname === "/") return false;
  return matchesPrefix(pathname, SAFE_NAV_PREFIXES);
}

export function isSafeApiGet(url: string): boolean {
  const pathname = pathnameOf(url);
  if (matchesPrefix(pathname, NEVER_CACHE_PREFIXES)) return false;
  return matchesPrefix(pathname, SAFE_API_PREFIXES);
}

export function shouldNeverCache(url: string): boolean {
  return matchesPrefix(pathnameOf(url), NEVER_CACHE_PREFIXES);
}

export function isStaticAsset(url: string): boolean {
  const pathname = pathnameOf(url);
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/axe-icon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js"
  );
}

export const SW_SKIP_WAITING_MESSAGE = "SKIP_WAITING";
export const SW_CACHE_LAST_VIEWED_MESSAGE = "CACHE_LAST_VIEWED";
export const SW_LAST_VIEWED_KEY = "axe-last-viewed";
