/**
 * Global "is everything actually live?" bus for the Trading OS mobile app.
 *
 * Mirrors the pattern in the Trading OS terminal so the two products share
 * the same honest semantics:
 *
 *   • pulsing green dot     → every feed the current page registered is live
 *   • amber dot             → at least one is degraded
 *   • dim grey dot (no anim)→ the current page has no opinion (no feeds claimed)
 *
 * The dot only goes green when a page has *explicitly* claimed feeds AND
 * they are all delivering. Silence is honest — if a page hasn't reported,
 * we never imply something is healthy.
 */

export type LiveStatus = {
  /**
   *  true  → every feed the current page registered is live
   *  false → at least one is stale / failing
   *  null  → the current page hasn't reported (no opinion)
   */
  allLive: boolean | null;
  /** Age of the freshest report in seconds, or null if not applicable. */
  freshestAgeSec: number | null;
  /** Number of feeds delivering / number tracked. */
  liveCount: number;
  totalCount: number;
  /** Optional human label for the tooltip — e.g. "Intel · 5 feeds". */
  label?: string;
};

const initialStatus: LiveStatus = {
  allLive: null,
  freshestAgeSec: null,
  liveCount: 0,
  totalCount: 0,
};

let current: LiveStatus = initialStatus;
const subs = new Set<(s: LiveStatus) => void>();

export function setLiveStatus(next: LiveStatus): void {
  current = next;
  subs.forEach((fn) => fn(current));
}

/**
 * Reset on unmount so navigating to a page that doesn't claim feeds
 * doesn't keep the previous page's "all live" state burning.
 */
export function clearLiveStatus(): void {
  setLiveStatus(initialStatus);
}

export function getLiveStatus(): LiveStatus {
  return current;
}

export function subscribeLiveStatus(fn: (s: LiveStatus) => void): () => void {
  subs.add(fn);
  fn(current);
  return () => {
    subs.delete(fn);
  };
}
