/**
 * What `/api/internal/key-health` probes on the shared intel-proxy, and how it
 * reads the answer (INTEL-FREE).
 *
 * The list used to live inside the route and predated #149. It still named
 * Unusual Whales as the key behind insiders, tide, dark pool and options, and
 * reported military, emergency, energy and cyber as "retired" — four feeds the
 * shared proxy has served live since 9 Nov 2026. An operator reading that page
 * would have chased a subscription nobody needs and ignored four feeds that do
 * work. It also counted a `db_stale` reply as healthy, so a feed whose every
 * live source was down showed green on its cached rows.
 *
 * The sources below are the ones AXE_SYSTEM_TRUTH.md lists for the proxy in
 * Ldezeeuw445/trading-os-app. Unusual Whales only appears when the host says
 * it is subscribed (`UNUSUAL_WHALES_ENABLED=true`), and then as optional.
 *
 * No framework imports, so it runs under `tsx --test`.
 */
import { INTEL_ACTION_SOURCE, isSourceAvailable } from "./intelSources";
import { staleReasonFromProxy } from "./providerStatus";

export type IntelFeedProbe = {
  action: string;
  name: string;
  /** Where the proxy gets the rows, for whoever reads the health page. */
  source: string;
  /** Edge secrets the proxy needs for this feed; empty means none. */
  env: string[];
};

/**
 * Actions `INTEL_ACTION_SOURCE` knows but key-health does not call, with why.
 * The test fails if an action is in neither list, so a new feed cannot be
 * forgotten here.
 */
export const INTEL_ACTIONS_NOT_PROBED: Record<string, string> = {
  openSourcesBrief: "built from the other feeds, so probing it only repeats their answers at extra quota",
};

/** Feeds Unusual Whales can serve on top of the free source, once subscribed. */
const UW_OPTIONAL = new Set(["insiderTrades", "darkPoolPrints", "unusualOptions", "marketTide"]);

const BASE_PROBES: IntelFeedProbe[] = [
  { action: "insiderTrades", name: "Insider (Form 4)", source: "FMP insider trading, SEC EDGAR Form 4", env: ["FMP_API_KEY"] },
  { action: "senateTrades", name: "Congress trades", source: "FMP senate and house trading", env: ["FMP_API_KEY"] },
  { action: "darkPoolPrints", name: "Short volume", source: "FINRA daily short sale volume", env: [] },
  { action: "unusualOptions", name: "Options flow", source: "CBOE delayed chains", env: [] },
  { action: "marketTide", name: "Market tide", source: "CBOE delayed chains", env: [] },
  { action: "corporateJets", name: "Corporate jets", source: "OpenSky", env: ["OPENSKY_USERNAME", "OPENSKY_PASSWORD"] },
  { action: "militaryRadar", name: "Military radar", source: "adsb.lol", env: [] },
  { action: "emergencyMonitor", name: "Emergency squawks", source: "adsb.lol", env: [] },
  { action: "vesselStream", name: "Vessels", source: "AISStream", env: ["AISSTREAM_API_KEY"] },
  { action: "gdeltEvents", name: "Conflict events", source: "GDELT", env: [] },
  { action: "energyFlows", name: "Energy flows", source: "EIA", env: ["EIA_API_KEY"] },
  { action: "cyberThreats", name: "Cyber threats", source: "CISA known exploited vulnerabilities", env: [] },
];

/** The probe list for this host, with Unusual Whales added only where it is switched on. */
export function intelFeedProbes(env: Record<string, string | undefined>): IntelFeedProbe[] {
  const uw = isSourceAvailable("unusual_whales", env);
  return BASE_PROBES.map((p) =>
    uw && UW_OPTIONAL.has(p.action)
      ? { ...p, source: `${p.source}; Unusual Whales (optional)`, env: [...p.env, "UNUSUAL_WHALES_TOKEN"] }
      : p,
  );
}

/** Every action the app calls, so the test can hold the probe list against it. */
export function knownIntelActions(): string[] {
  return Object.keys(INTEL_ACTION_SOURCE);
}

export type ProbeOutcome = { state: "ok" | "error"; detail: string };

/**
 * Turns one proxy reply into a health line.
 *
 * `invalid_token` is not a key problem: the proxy skips auth only for actions
 * on its own whitelist, so an action the deployed build has no handler for
 * answers exactly like a bad session. Saying "redeploy" points at the fix.
 */
export function readProbeReply(
  probe: Pick<IntelFeedProbe, "action" | "source">,
  httpOk: boolean,
  status: number,
  json: { ok?: boolean; data?: unknown; error?: string; source?: string; unavailable?: unknown } | null,
): ProbeOutcome {
  if (!httpOk || !json?.ok) {
    const error = json?.error ?? `HTTP ${status}`;
    if (/invalid_token/i.test(error)) {
      return {
        state: "error",
        detail: `the deployed intel-proxy has no public handler for ${probe.action}; redeploy it from trading-os-app`,
      };
    }
    return { state: "error", detail: error };
  }
  const rows = Array.isArray(json.data) ? json.data.length : json.data ? 1 : 0;
  const stale = staleReasonFromProxy(json);
  if (stale) {
    return { state: "error", detail: `${rows} cached rows only; ${probe.source} unavailable: ${stale}` };
  }
  const source = json.source ? ` source=${json.source}` : "";
  return rows > 0
    ? { state: "ok", detail: `${rows} rows${source}` }
    : { state: "error", detail: `0 rows${source}; ${probe.source} returned nothing (key missing or upstream empty)` };
}
