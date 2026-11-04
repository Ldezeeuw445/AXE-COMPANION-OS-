/**
 * Pure helpers for the Trading OS ↔ Companion auth handoff.
 * Mirrors trading-os-app supabase/functions/auth-handoff/handler.ts so both
 * sides validate the same way. The edge function is the source of truth:
 * - mint (user JWT) → one-time code, 60 s TTL, stored only as peppered hash
 * - exchange (public, rate-limited) → consumes the code once, returns a
 *   magic-link token_hash that the client turns into a session via verifyOtp.
 * The code only ever travels in the URL fragment and is stripped at once.
 */

export const APP_HANDOFF_HOSTS = [
  "tradingosapp.com",
  "www.tradingosapp.com",
  "axecompanion.com",
  "www.axecompanion.com",
] as const;

export const TRADING_OS_ORIGIN = "https://tradingosapp.com";
export const COMPANION_ORIGIN = "https://www.axecompanion.com";

function isLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

export function validateHandoffRedirect(
  raw: string,
  opts: { allowLocalhost?: boolean } = {},
): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, error: "invalid_redirect" };
  }
  if (url.username || url.password) return { ok: false, error: "redirect_has_credentials" };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "redirect_protocol" };
  const host = url.hostname.toLowerCase();
  const allowed = isLocal(host)
    ? opts.allowLocalhost === true
    : (APP_HANDOFF_HOSTS as readonly string[]).includes(host);
  if (!allowed) return { ok: false, error: "redirect_not_allowlisted" };
  if (!isLocal(host) && url.protocol !== "https:") return { ok: false, error: "redirect_https_required" };
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/auth/handoff") return { ok: false, error: "redirect_path_must_be_auth_handoff" };
  return { ok: true, url };
}

export function validateNextPath(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim() || "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value.includes("://")) return "/";
  return value.slice(0, 200);
}

export function extractHandoffCode(hash: string, search: string): string | null {
  const h = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("c");
  if (h && h.trim()) return h.trim();
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("c");
  return q && q.trim() ? q.trim() : null;
}

/** Same canonical form TOS uses when minting (apex Companion → www). */
export function canonicalizeHandoffOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === "axecompanion.com") url.hostname = "www.axecompanion.com";
    return url.origin;
  } catch {
    return origin;
  }
}

export function handoffRedirectUri(origin: string): string {
  return `${canonicalizeHandoffOrigin(origin).replace(/\/+$/, "")}/auth/handoff`;
}
