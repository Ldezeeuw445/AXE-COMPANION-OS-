/**
 * App-page prefixes that require a signed-in (non-anonymous) user.
 *
 * A prefix has to end at a path boundary. Measured 2026-10-17: a bare
 * `startsWith` meant `/market` also matched `/marketing/...`, so every
 * dev screenshot route redirected to /login — and `npm run capture:marketing`
 * had been quietly photographing the login page.
 *
 * `/market` and `/market/anything` stay protected; `/marketing/anything` is a
 * different route and is not.
 *
 * Dependency-free so the unit test can import it with tsx.
 */
export const PROTECTED_PREFIXES = [
  "/chart",
  "/chat",
  "/cockpit",
  "/history",
  "/intel",
  "/journal",
  "/market",
  "/accounts",
  "/alerts",
  "/positions",
  "/vault",
  "/watchlist",
  "/actions",
  "/settings",
  "/upgrade",
  "/wallets",
  "/trading-team",
  "/onboarding",
  "/admin",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Unauthenticated hits on a protected page go here. Login reads `next`
 * (`/login?next=/upgrade` on the landing checkout) and `safeAppPath` keeps
 * it on-app.
 */
export function loginRedirectSearch(pathname: string): string {
  return new URLSearchParams({ next: pathname }).toString();
}
