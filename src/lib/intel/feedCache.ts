/**
 * Per-feed fallback for the intel view (INTEL-FREE).
 *
 * The intel view used to swap the whole page for the last cached snapshot as
 * soon as one market feed failed. One dead FINRA file then hid live insider and
 * Congress rows, and every tile read "cached" with no reason. Now each feed
 * stands on its own: a failing feed shows its own last good rows as "cached"
 * with this round's reason, or "error" with that reason when there are none,
 * and the feeds that answered stay live.
 *
 * Each feed carries its own `savedAt`. Rows served from cache keep their old
 * timestamp, so a feed that stays down ages out instead of being refreshed by
 * every page render.
 *
 * Dependency-free, so `node --test` can exercise it directly.
 */

import { providerTile, userFacingProxyError, type ProviderTile } from "./providerStatus";

export type CachedFeed<T> = { rows: T; savedAt: number };

export type FeedRound<T> =
  | { ok: true; rows: T; staleReason?: string }
  | { ok: false; error: string };

export type ResolvedFeed<Id extends string, T> = {
  rows: T;
  status: ProviderTile<Id>;
  /** What to keep for the next round; undefined when there is nothing worth keeping. */
  cache: CachedFeed<T> | undefined;
  /** True when this round answered with fresh rows from a live source. */
  live: boolean;
  /** True when the rows on screen are our own cached rows, not this round's. */
  fromCache: boolean;
};

export function resolveFeed<Id extends string, T>(opts: {
  id: Id;
  label: string;
  description: string;
  round: FeedRound<T>;
  empty: T;
  hasRows: (rows: T) => boolean;
  cached: CachedFeed<T> | undefined;
  now: number;
  maxAgeMs: number;
}): ResolvedFeed<Id, T> {
  const { id, label, description, round, empty, hasRows, now, maxAgeMs } = opts;
  const cached =
    opts.cached && now - opts.cached.savedAt < maxAgeMs && hasRows(opts.cached.rows)
      ? opts.cached
      : undefined;

  if (round.ok) {
    const any = hasRows(round.rows);
    const status = providerTile(id, label, description, any, undefined, round.staleReason);
    // The proxy's own stale rows are not a fresh answer: keep our older copy's
    // timestamp rather than restarting the clock on them.
    const live = any && !round.staleReason;
    return {
      rows: any ? round.rows : empty,
      status,
      cache: live ? { rows: round.rows, savedAt: now } : cached,
      live,
      fromCache: false,
    };
  }

  if (cached) {
    const age = Math.max(0, Math.round((now - cached.savedAt) / 60_000));
    const reason = `${userFacingProxyError(round.error)} (last good rows ${age} min old)`;
    return {
      rows: cached.rows,
      status: providerTile(id, label, description, true, undefined, reason),
      cache: cached,
      live: false,
      fromCache: true,
    };
  }

  return {
    rows: empty,
    status: providerTile(id, label, description, false, round.error),
    cache: undefined,
    live: false,
    fromCache: false,
  };
}
