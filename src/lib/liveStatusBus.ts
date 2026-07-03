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
  /** Runtime source, used by the central reducer. */
  scope?: string;
};

const initialStatus: LiveStatus = {
  allLive: null,
  freshestAgeSec: null,
  liveCount: 0,
  totalCount: 0,
};

let current: LiveStatus = initialStatus;
const subs = new Set<(s: LiveStatus) => void>();
const reports = new Map<string, LiveStatus>();

function severityRank(s: LiveStatus["severity"]): number {
  if (s === "blocking") return 4;
  if (s === "degraded") return 3;
  if (s === "fresh") return 2;
  if (s === "inactive") return 1;
  return 0;
}

function deriveSeverity(status: LiveStatus): LiveStatus["severity"] {
  if (status.severity) return status.severity;
  if (status.allLive === true) return "fresh";
  if (status.allLive === false) return "degraded";
  return "inactive";
}

function reduceReports(): LiveStatus {
  const list = Array.from(reports.values());
  if (list.length === 0) return initialStatus;
  const active = list.filter((r) => deriveSeverity(r) !== "inactive");
  if (active.length === 0) return { ...initialStatus, severity: "inactive" };
  const worst = active.reduce((a, b) => (severityRank(deriveSeverity(b)) > severityRank(deriveSeverity(a)) ? b : a));
  const liveCount = active.reduce((sum, r) => sum + r.liveCount, 0);
  const totalCount = active.reduce((sum, r) => sum + r.totalCount, 0);
  const freshAges = active.map((r) => r.freshestAgeSec).filter((v): v is number => typeof v === "number");
  const severity = deriveSeverity(worst);
  return {
    allLive: severity === "fresh" ? true : severity === "inactive" ? null : false,
    liveCount,
    totalCount,
    freshestAgeSec: freshAges.length ? Math.min(...freshAges) : null,
    label: worst.label,
    severity,
    reason: worst.reason,
    scope: worst.scope,
  };
}

export function setLiveStatus(next: LiveStatus): void {
  if (next.scope) {
    reports.set(next.scope, next);
    current = reduceReports();
  } else {
    current = next;
  }
  subs.forEach((fn) => fn(current));
}

/**
 * Reset on unmount so navigating to a page that doesn't claim feeds
 * doesn't keep the previous page's "all live" state burning.
 */
export function clearLiveStatus(): void {
  reports.clear();
  setLiveStatus(initialStatus);
}

export function clearLiveStatusScope(scope: string): void {
  reports.delete(scope);
  current = reduceReports();
  subs.forEach((fn) => fn(current));
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
