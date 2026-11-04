/**
 * Where a post-login redirect may go. Landing checkout uses
 * `/login?next=/upgrade`; an open redirect would be worse than sending
 * everyone to chat.
 *
 * Dependency-free so the verify suite can import it with tsx.
 */

const ALLOWED = new Set([
  "/chat",
  "/upgrade",
  "/welcome",
  "/accounts",
  "/chart",
  "/cockpit",
  "/alerts",
  "/journal",
  "/feed",
  "/intel",
  "/settings",
  "/watchlist",
  "/positions",
  "/history",
]);

export const DEFAULT_AFTER_LOGIN = "/chat";

export function safeAppPath(raw: string | null | undefined): string {
  if (typeof raw !== "string") return DEFAULT_AFTER_LOGIN;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return DEFAULT_AFTER_LOGIN;
  }
  const path = trimmed.split("?")[0]?.split("#")[0] ?? "";
  return ALLOWED.has(path) ? path : DEFAULT_AFTER_LOGIN;
}
