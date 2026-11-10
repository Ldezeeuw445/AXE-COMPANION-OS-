/**
 * Provider tile state for the intel view (INTEL-FREE).
 *
 * The intel proxy has three outcomes per source: live rows, cached rows served
 * because every live source failed (`source: "db_stale"` plus `unavailable`
 * reasons), or a hard failure. The middle one used to be read as "live", which
 * hid an outage behind old rows. It now has its own state and keeps its reason.
 */

export type IntelProviderState = "live" | "stale" | "off" | "error";

export type ProviderTile<Id extends string = string> = {
  id: Id;
  label: string;
  state: IntelProviderState;
  description?: string;
  /** Human-readable reason when state is stale/error/off. */
  reason?: string;
};

/** Upper bound on how many source reasons end up in one tile. */
const MAX_REASONS = 3;

/**
 * Map a proxy failure into tile/hover copy. `intelClient` stores
 * `intel_proxy_<status>:<body>` on HTTP errors; the body is Edge HTML/JSON
 * and must never reach the intel view.
 */
export function userFacingProxyError(err: string): string {
  const http = /^intel_proxy_(\d{3}):/.exec(err);
  if (http) return `Bron tijdelijk niet bereikbaar (HTTP ${http[1]})`;
  if (err.startsWith("intel_proxy_timeout_")) {
    return "Bron tijdelijk niet bereikbaar (timeout)";
  }
  return err;
}

/**
 * Why a successful proxy reply is still not live data, or undefined when it is.
 *
 * Only `source: "db_stale"` counts: rows from the feed's own fresh DB read are
 * live, and so is anything without a `source` field (older proxy deploys).
 */
export function staleReasonFromProxy(json: {
  source?: unknown;
  unavailable?: unknown;
}): string | undefined {
  if (json.source !== "db_stale") return undefined;
  const reasons = Array.isArray(json.unavailable)
    ? json.unavailable
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .slice(0, MAX_REASONS)
    : [];
  return reasons.length > 0 ? reasons.join("; ") : "live_sources_unavailable";
}

export function providerTile<Id extends string>(
  id: Id,
  label: string,
  description: string,
  ok: boolean,
  err?: string,
  staleReason?: string,
): ProviderTile<Id> {
  if (ok && staleReason) {
    return {
      id,
      label,
      state: "stale",
      description: `${description} — showing cached rows; live source unavailable: ${staleReason}`,
      reason: staleReason,
    };
  }
  if (ok) return { id, label, state: "live", description };
  if (err) {
    const reason = userFacingProxyError(err);
    return {
      id,
      label,
      state: "error",
      description: `${description} — unavailable: ${reason}`,
      reason,
    };
  }
  return {
    id,
    label,
    state: "off",
    description: `${description} — waiting for new signals…`,
    reason: "no_data",
  };
}
