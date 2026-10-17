/*
 * Deliberately not marked "server-only", even though every caller is server
 * code. A client component reaches this transitively today —
 * WatchlistPageScreen -> brokerSymbolRuntime -> metaApiClient -> metaApiEnv —
 * so the marker fails the build. That import chain is the actual problem and is
 * worth untangling separately; nothing leaks through it (Next only inlines
 * NEXT_PUBLIC_ vars, so these reads are undefined in the browser), it just
 * drags server modules into the client bundle.
 */

/**
 * First env var among `names` that holds a non-empty value, else null.
 *
 * Every credential in this app has more than one accepted spelling, and those
 * chains were written with `??`. `??` only falls through on null/undefined — an
 * env var that is *present but empty* is a string, so it wins the chain and
 * shadows the name that actually holds the value.
 *
 * That is not hypothetical: production had METAAPI_TOKEN set empty alongside a
 * populated AXE_METAAPI_TOKEN, so getMetaApiToken() returned null and every MT5
 * path switched itself off silently. /api/cron/mt5-sync answered
 * "metaapi_not_configured" while the credentials were sitting right there.
 *
 * An empty value in a .env file is normal — a placeholder line, a key rotated
 * out, a copy-paste that lost its value. Treating it as "not set" is what the
 * chains meant all along.
 */
export function firstNonEmptyEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}
