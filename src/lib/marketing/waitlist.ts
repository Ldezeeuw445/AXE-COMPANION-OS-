/**
 * Waitlist signup rules, kept out of the route so they can be exercised
 * without a server.
 *
 * The form on `/` used to write the address to `localStorage` and print
 * "You're on the list — thank you." Nothing left the browser. These helpers
 * exist so the replacement cannot quietly do the same thing: every rejection
 * has a reason the visitor reads, and the only success path is one the
 * database accepted.
 *
 * Dependency-free so `node --experimental-strip-types` can run it.
 */

export const WAITLIST_SURFACES = ["companion", "trading-os"] as const;
export type WaitlistSurface = (typeof WAITLIST_SURFACES)[number];

/** Addresses longer than this are not addresses. RFC 5321 caps the path at 254. */
export const MAX_EMAIL_LENGTH = 254;

export type NormalizedSignup = { email: string; surface: WaitlistSurface; source: string | null };

export type SignupParse =
  | { ok: true; value: NormalizedSignup }
  | { ok: false; status: number; error: string };

/**
 * One deliberately plain check. A stricter regex rejects addresses that work
 * (plus-tags, new TLDs, unicode locals), and the cost of letting a typo
 * through is one undeliverable row — far cheaper than turning a real trader
 * away at the only form on the page.
 */
function looksLikeEmail(value: string): boolean {
  if (value.length < 6 || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return true;
}

export function parseSignup(body: unknown): SignupParse {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Send a JSON body with an email." };
  }
  const raw = (body as { email?: unknown }).email;
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, status: 400, error: "Enter your email address." };
  }
  const email = raw.trim().toLowerCase();
  if (!looksLikeEmail(email)) {
    return { ok: false, status: 400, error: "That does not look like an email address." };
  }

  const rawSurface = (body as { surface?: unknown }).surface;
  const surface: WaitlistSurface = WAITLIST_SURFACES.includes(rawSurface as WaitlistSurface)
    ? (rawSurface as WaitlistSurface)
    : "companion";

  const rawSource = (body as { source?: unknown }).source;
  const source =
    typeof rawSource === "string" && rawSource.trim() ? rawSource.trim().slice(0, 120) : null;

  return { ok: true, value: { email, surface, source } };
}

/* ── throttle ──────────────────────────────────────────────────────────────
   A public unauthenticated write needs a ceiling, or the first bot that finds
   it fills the table. In-memory and per-instance: good enough for one VPS,
   and it degrades to "no limit" rather than to "no signups" if the app ever
   runs on several. ───────────────────────────────────────────────────────── */

export const THROTTLE_WINDOW_MS = 60 * 60 * 1000;
export const THROTTLE_MAX_PER_WINDOW = 5;

export type ThrottleState = Map<string, number[]>;

export function throttleAllows(
  state: ThrottleState,
  key: string,
  now: number,
  windowMs = THROTTLE_WINDOW_MS,
  max = THROTTLE_MAX_PER_WINDOW,
): boolean {
  const cutoff = now - windowMs;
  const hits = (state.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    state.set(key, hits);
    return false;
  }
  hits.push(now);
  state.set(key, hits);

  // Drop keys that have gone quiet, so a long-running process does not grow
  // one entry per address that ever visited.
  if (state.size > 5_000) {
    for (const [k, v] of state) {
      if (v.every((t) => t <= cutoff)) state.delete(k);
    }
  }
  return true;
}

/** The client IP, best effort, for the throttle key only. Never stored. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
