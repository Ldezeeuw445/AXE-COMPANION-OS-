/**
 * Global "is everything actually live?" bus for the AXE Companion mobile app.
 *
 * Mirrors the pattern in the Trading OS terminal so the two products share
 * the same honest semantics:
 *
 *   • pulsing green dot     → current page registered fresh/connected runtime
 *   • amber dot             → current page is partial, warming, stale, or degraded
 *   • dim grey dot (no anim)→ current page has no runtime opinion
 *
 * The dot only goes green when a page has *explicitly* claimed feeds AND
 * they are all delivering. Silence is honest — if a page hasn't reported,
 * we never imply something is healthy.
 */

export type LiveStatus = {
  /**
   *  true  → current page runtime is fresh/connected
   *  false → current page runtime is partial / stale / failing
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
  /** Optional explicit severity for the header dot. */
  severity?: "fresh" | "degraded" | "blocking" | "inactive";
  /** Human reason shown in the top AXE tooltip. */
  reason?: string;
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
