/**
 * Stale fallbacks in the intel proxy's in-memory cache.
 *
 * When every live source for a feed fails, the proxy answers with old DB rows
 * marked `source: "db_stale"` plus the failure reasons. That reply is cached
 * like any other, so the marker has to be cached with it: a bare row array
 * would make every warm-cache hit look live again and the app would drop the
 * "cached" tile after one request.
 *
 * Stale entries also expire sooner than live ones, so the live sources get
 * retried within minutes instead of after the full cache TTL.
 *
 * Pure TypeScript with no imports; tested from
 * src/lib/intel/freeSources/staleReply.test.ts.
 */
export const STALE_REPLY_TTL_MS = 5 * 60 * 1000;

export type StaleReply<T> = {
  readonly kind: "stale_reply";
  data: T;
  unavailable: string[];
};

export function staleReply<T>(data: T, unavailable: string[]): StaleReply<T> {
  return { kind: "stale_reply", data, unavailable: [...unavailable] };
}

export function isStaleReply(value: unknown): value is StaleReply<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "stale_reply"
  );
}

/** TTL for a cache entry: stale fallbacks get the short one. */
export function cacheTtlFor(value: unknown, liveTtlMs: number): number {
  return isStaleReply(value) ? Math.min(STALE_REPLY_TTL_MS, liveTtlMs) : liveTtlMs;
}

/**
 * Response body for a fresh stale fallback or a cache hit. A stale entry keeps
 * `source: "db_stale"` and its reasons; a live entry reports `liveSource` when
 * the handler labels its cache hits (short volume says "cache").
 */
export function replyBody<T>(
  value: T | StaleReply<T>,
  liveSource?: string,
): { ok: true; data: T; source?: string; unavailable?: string[] } {
  if (isStaleReply(value)) {
    return {
      ok: true,
      data: value.data as T,
      source: "db_stale",
      unavailable: value.unavailable,
    };
  }
  return liveSource ? { ok: true, data: value, source: liveSource } : { ok: true, data: value };
}
