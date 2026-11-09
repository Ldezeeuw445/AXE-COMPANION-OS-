/**
 * Which intel actions need a paid source, and whether we have it.
 *
 * On 2026-10-11 `intel-warmup` reported `warmed: 3, failed: 6` every thirty
 * minutes, and had done for a long time. Five of those six are Unusual Whales
 * endpoints and the key was never bought. A check that is permanently red is
 * not a warning, it is wallpaper — and it hides the day a source that *should*
 * work stops working.
 *
 * Luka's call: Unusual Whales comes later, or a free alternative fills the
 * gap. Until then these actions are *not configured*, which is a different
 * thing from *broken*, and the cron should say so.
 *
 * Flip `UNUSUAL_WHALES_ENABLED=true` on the host the day the subscription
 * exists; nothing else needs changing.
 *
 * Dependency-free so it can be exercised with `node --experimental-strip-types`.
 */

export type IntelSource = "unusual_whales" | "alphavantage" | "free";

/**
 * Actions the intel proxy serves, and what each one needs.
 *
 * Since 9 Nov 2026 the shared intel-proxy (deployed from
 * Ldezeeuw445/trading-os-app, the one function for Trading OS and this app)
 * fills every feed from real sources that cost nothing: FMP for insiders and
 * Congress, CBOE delayed chains for options and tide, FINRA for off-exchange
 * volume, adsb.lol for military and emergency aircraft, CISA for exploited
 * vulnerabilities, EIA for energy. Unusual Whales is no longer needed.
 */
export const INTEL_ACTION_SOURCE: Record<string, IntelSource> = {
  insiderTrades: "free",
  senateTrades: "free",
  darkPoolPrints: "free",
  unusualOptions: "free",
  marketTide: "free",
  corporateJets: "free",
  vesselStream: "free",
  gdeltEvents: "free",
  openSourcesBrief: "free",
  militaryRadar: "free",
  emergencyMonitor: "free",
  cyberThreats: "free",
  energyFlows: "free",
};

function envFlag(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

/**
 * @param env  process.env, passed in so this stays testable
 */
export function isSourceAvailable(source: IntelSource, env: Record<string, string | undefined>): boolean {
  if (source === "free") return true;
  if (source === "unusual_whales") {
    // An explicit switch rather than "is a key present somewhere": the key
    // lives in the Supabase edge function, which this process cannot read, so
    // guessing from local env would be wrong in both directions.
    return envFlag(env.UNUSUAL_WHALES_ENABLED);
  }
  if (source === "alphavantage") {
    // This key *is* read by this process — the sync cron runs here — so its
    // presence is a real answer rather than a guess.
    return (env.ALPHAVANTAGE_API_KEY ?? "").trim().length > 0;
  }
  return false;
}

export type ActionAvailability =
  | { available: true }
  | { available: false; source: IntelSource; reason: string };

export function actionAvailability(
  action: string,
  env: Record<string, string | undefined>,
): ActionAvailability {
  const source = INTEL_ACTION_SOURCE[action] ?? "free";
  if (isSourceAvailable(source, env)) return { available: true };
  return {
    available: false,
    source,
    reason:
      source === "unusual_whales"
        ? "Unusual Whales is not subscribed — set UNUSUAL_WHALES_ENABLED=true once it is"
        : source === "alphavantage"
          ? "Alpha Vantage has the data for free — set ALPHAVANTAGE_API_KEY and schedule /api/cron/congress-trades-sync"
          : `source ${source} is not configured`,
  };
}

/** The actions worth warming right now. */
export function availableIntelActions(
  actions: readonly string[],
  env: Record<string, string | undefined>,
): string[] {
  return actions.filter((a) => actionAvailability(a, env).available);
}
