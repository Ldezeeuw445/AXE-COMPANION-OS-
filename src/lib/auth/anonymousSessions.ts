import "server-only";

/**
 * Anonymous sessions are not accepted anywhere in this app.
 *
 * Measured 2026-10-11: 182 of 192 accounts were anonymous. They had 208 broker
 * account rows, 8032 generated morning briefs, zero trades and zero
 * subscriptions. An account with no email cannot be recovered by the trader or
 * by us, and every one of those briefs cost a model call for a person who could
 * never read it twice.
 *
 * The app no longer creates them (see /api/auth/demo). This is the other half:
 * even if an anonymous JWT arrives from somewhere else — the Supabase project
 * setting is a dashboard switch, and it is still on at the time of writing —
 * this app treats it as signed out.
 *
 * Checked in two places on purpose: the proxy, which covers every page and
 * route, and the two server auth helpers, which cover anything that bypasses
 * the proxy. One of them failing open is then not enough to let one in.
 */

type MaybeAnonymousUser = {
  is_anonymous?: boolean | null;
  app_metadata?: { provider?: string | null } | null;
} | null;

export function isAnonymousUser(user: MaybeAnonymousUser): boolean {
  if (!user) return false;
  if (user.is_anonymous === true) return true;
  // Older sessions predate the is_anonymous claim; they still carry the
  // provider that minted them.
  return (user.app_metadata?.provider ?? "") === "anonymous";
}

/** The user to act on, or null when the session is anonymous. */
export function rejectAnonymous<T extends MaybeAnonymousUser>(user: T): T | null {
  return isAnonymousUser(user) ? null : user;
}
