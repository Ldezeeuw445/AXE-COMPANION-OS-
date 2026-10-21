/**
 * Static MT5 broker / server support list.
 *
 * MetaApi only knows servers in its own registry, and this repo has no live
 * broker-search client. A name check that needs a login would be the thing we
 * are trying to avoid: the trader should see whether AXE even *knows* the
 * server before typing a password.
 *
 * Three verdicts, nothing in between:
 *   - known        — on this list, MetaApi typically accepts it as MT5
 *   - unknown      — not listed; many white-label MT5 servers still connect
 *   - unsupported  — a different platform (MT4, cTrader, IBKR, …)
 *
 * Unknown is not a refusal. Unsupported is. Neither talks to the broker.
 */

export type BrokerSupportKind = "known" | "unknown" | "unsupported";

export const BROKER_SUPPORT_TITLES: Record<BrokerSupportKind, string> = {
  known: "Known broker — supported",
  unknown: "Unknown — may still work",
  unsupported: "Not supported",
};

export const BROKER_SUPPORT_EXPLANATIONS: Record<BrokerSupportKind, string> = {
  known:
    "This MT5 server is on AXE's known list. You can connect with your login next — nothing is sent until you press Connect.",
  unknown:
    "This name is not on the known list. Many white-label MT5 servers still connect. Nothing is sent until you press Connect; if MetaApi does not recognise it, you can add servers.dat after.",
  unsupported:
    "This looks like a platform AXE cannot connect as MT5. Use the exact server name from MT5 → File → Login to Trade Account.",
};

export type KnownBroker = {
  id: string;
  name: string;
  /** Extra spellings a trader actually types. */
  aliases: readonly string[];
  /** Typical MT5 server strings, copied from live terminals. */
  servers: readonly string[];
  /** Shown as a one-tap chip before the trader types. */
  popular?: boolean;
};

export type UnsupportedPlatform = {
  id: string;
  name: string;
  pattern: RegExp;
};

export type BrokerSupportMatch = {
  id: string;
  name: string;
  /** Server string we would fill in if they pick this row. */
  sampleServer: string | null;
};

export type BrokerSupportResult = {
  kind: BrokerSupportKind;
  title: string;
  explanation: string;
  match: BrokerSupportMatch | null;
};

/**
 * Retail + prop MT5 names this product has actually seen, plus the servers
 * the Accounts wizard already used as examples. Not a MetaQuotes dump —
 * unknown does not mean it will fail.
 */
export const KNOWN_MT5_BROKERS: readonly KnownBroker[] = [
  {
    id: "icmarkets",
    name: "IC Markets",
    aliases: ["ic markets", "icmarketssc", "icmarketseu", "icm"],
    servers: [
      "ICMarketsSC-Live",
      "ICMarketsSC-Live02",
      "ICMarketsSC-Live03",
      "ICMarketsSC-Demo",
      "ICMarketsEU-Live",
      "ICMarketsEU-Demo",
    ],
    popular: true,
  },
  {
    id: "pepperstone",
    name: "Pepperstone",
    aliases: ["pepperstoneuk", "pepperstone-mt5"],
    servers: ["Pepperstone-MT5-Live01", "Pepperstone-MT5-Demo", "PepperstoneUK-Live", "Pepperstone-Demo"],
    popular: true,
  },
  {
    id: "ftmo",
    name: "FTMO",
    aliases: ["ftmo-server", "ftmo-demo"],
    servers: ["FTMO-Server", "FTMO-Server2", "FTMO-Demo", "FTMO-Demo2"],
    popular: true,
  },
  {
    id: "xm",
    name: "XM",
    aliases: ["xmglobal", "xm.com", "xmtrading"],
    servers: ["XMGlobal-MT5 1", "XMGlobal-MT5 2", "XM.COM-MT5", "XMTrading-MT5 1"],
    popular: true,
  },
  {
    id: "exness",
    name: "Exness",
    aliases: ["exnessky", "exness-mt5"],
    servers: ["Exness-MT5Real", "Exness-MT5Trial", "Exness-MT5Real7", "ExnessKY-MT5Real"],
    popular: true,
  },
  {
    id: "upcomers",
    name: "Upcomers",
    aliases: ["upcomers-oracle"],
    servers: ["Upcomers"],
    popular: true,
  },
  {
    id: "fusion",
    name: "Fusion Markets",
    aliases: ["fusionmarkets"],
    servers: ["FusionMarkets-Live", "FusionMarkets-Demo"],
  },
  {
    id: "tickmill",
    name: "Tickmill",
    aliases: ["tickmilluk", "tickmilleu"],
    servers: ["Tickmill-Live", "Tickmill-Demo", "TickmillUK-Live", "TickmillEU-Live"],
  },
  {
    id: "fpmarkets",
    name: "FP Markets",
    aliases: ["fp markets", "firstprudential"],
    servers: ["FPMarkets-Live", "FPMarkets-Demo", "FPMarketsLLC-Live"],
  },
  {
    id: "admirals",
    name: "Admirals",
    aliases: ["admiral markets", "admiralmarkets"],
    servers: ["Admirals-Live", "Admirals-Demo", "AdmiralMarkets-Live"],
  },
  {
    id: "avatrade",
    name: "AvaTrade",
    aliases: ["ava trade", "avatrade-mt5"],
    servers: ["AvaTrade-Live", "AvaTrade-Demo"],
  },
  {
    id: "roboforex",
    name: "RoboForex",
    aliases: ["robo forex", "rfxt"],
    servers: ["RoboForex-ECN", "RoboForex-Pro", "RoboForex-Demo"],
  },
  {
    id: "justmarkets",
    name: "JustMarkets",
    aliases: ["justforex", "just markets"],
    servers: ["JustMarkets-Live", "JustMarkets-Demo"],
  },
  {
    id: "eightcap",
    name: "Eightcap",
    aliases: ["8cap"],
    servers: ["Eightcap-Live", "Eightcap-Demo"],
  },
  {
    id: "vantage",
    name: "Vantage",
    aliases: ["vantagefx", "vantagemarkets"],
    servers: ["VantageInternational-Live", "VantageInternational-Demo"],
  },
  {
    id: "thinkmarkets",
    name: "ThinkMarkets",
    aliases: ["thinkmarkets-mt5", "thinkforex"],
    servers: ["ThinkMarkets-Live", "ThinkMarkets-Demo"],
  },
  {
    id: "blackbull",
    name: "BlackBull",
    aliases: ["blackbullmarkets", "black bull"],
    servers: ["BlackBullMarkets-Live", "BlackBullMarkets-Demo"],
  },
  {
    id: "oanda",
    name: "OANDA",
    aliases: ["oanda-mt5"],
    servers: ["OANDA-MT5 Live", "OANDA-MT5 Practice"],
  },
  {
    id: "forexcom",
    name: "Forex.com",
    aliases: ["forex com", "gaincapital"],
    servers: ["Forex.com-Live", "Forex.com-Demo"],
  },
  {
    id: "the5ers",
    name: "The5ers",
    aliases: ["the 5ers", "5ers"],
    servers: ["The5ers-Live", "The5ers-Demo"],
  },
  {
    id: "fundednext",
    name: "FundedNext",
    aliases: ["funded next"],
    servers: ["FundedNext-Server", "FundedNext-Demo"],
  },
  {
    id: "fundingpips",
    name: "FundingPips",
    aliases: ["funding pips"],
    servers: ["FundingPips-Live", "FundingPips-Demo"],
  },
  {
    id: "e8",
    name: "E8 Markets",
    aliases: ["e8", "e8 funding", "e8markets"],
    servers: ["E8-Live", "E8-Demo"],
  },
  {
    id: "alpha_capital",
    name: "Alpha Capital Group",
    aliases: ["alpha capital", "acg"],
    servers: ["AlphaCapital-Live", "AlphaCapital-Demo"],
  },
  {
    id: "blue_guardian",
    name: "Blue Guardian",
    aliases: ["blueguardian"],
    servers: ["BlueGuardian-Live", "BlueGuardian-Demo"],
  },
  {
    id: "goat_funded",
    name: "Goat Funded Trader",
    aliases: ["goatfunded", "goat funded trader"],
    servers: ["GoatFundedTrader-Live", "GoatFundedTrader-Demo"],
  },
];

/**
 * Platforms a trader names that are not MT5 cloud. Futures desks in the
 * risk-firm list (Topstep, Apex) live here too — recognising the firm is not
 * the same as being able to log into it.
 */
export const UNSUPPORTED_PLATFORMS: readonly UnsupportedPlatform[] = [
  { id: "mt4", name: "MetaTrader 4", pattern: /\bmt\s*4\b|\bmt4\b|\bmetatrader\s*4\b/i },
  { id: "ctrader", name: "cTrader", pattern: /\bc\s*-?\s*trader\b|\bctrader\b/i },
  { id: "tradingview", name: "TradingView", pattern: /\btrading\s*view\b|\btradingview\b/i },
  { id: "ibkr", name: "Interactive Brokers", pattern: /\binteractive\s*brokers\b|\bibkr\b|\btws\b|\bib\s*gateway\b/i },
  { id: "alpaca", name: "Alpaca", pattern: /\balpaca\b/i },
  { id: "ninjatrader", name: "NinjaTrader", pattern: /\bninja\s*trader\b|\bninjatrader\b/i },
  { id: "thinkorswim", name: "thinkorswim", pattern: /\bthink\s*or\s*swim\b|\bthinkorswim\b|\btos\b/i },
  { id: "tradestation", name: "TradeStation", pattern: /\btrade\s*station\b|\btradestation\b/i },
  { id: "matchtrader", name: "Match-Trader", pattern: /\bmatch\s*-?\s*trader\b/i },
  { id: "tradelocker", name: "TradeLocker", pattern: /\btrade\s*locker\b|\btradelocker\b/i },
  { id: "dxtrade", name: "DXtrade", pattern: /\bdx\s*trade\b|\bdxtrade\b/i },
  { id: "tradovate", name: "Tradovate", pattern: /\btradovate\b/i },
  { id: "projectx", name: "ProjectX", pattern: /\bproject\s*x\b|\bprojectx\b/i },
  { id: "topstep", name: "Topstep", pattern: /\btopstep\b/i },
  { id: "apex", name: "Apex Trader Funding", pattern: /\bapex(\s+trader)?(\s+funding)?\b/i },
  { id: "binance", name: "Binance", pattern: /\bbinance\b/i },
  { id: "coinbase", name: "Coinbase", pattern: /\bcoinbase\b/i },
  { id: "robinhood", name: "Robinhood", pattern: /\brobinhood\b/i },
];

export function normalizeBrokerQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function identities(broker: KnownBroker): string[] {
  return [broker.name, ...broker.aliases, ...broker.servers];
}

function sampleServerFor(broker: KnownBroker): string {
  return broker.servers[0] ?? broker.name;
}

function matchScore(queryNorm: string, identity: string): number {
  const n = normalizeBrokerQuery(identity);
  if (!queryNorm || !n) return 0;
  if (queryNorm === n) return 100 + n.length;
  // Three letters still offer chips; a verdict needs a real stem so "the" is
  // not The5ers and "for" is not Forex.com.
  if (n.startsWith(queryNorm) && queryNorm.length >= 4) return 60 + queryNorm.length;
  if (queryNorm.startsWith(n) && n.length >= 4) return 50 + n.length;
  return 0;
}

function bestKnownMatch(query: string): { broker: KnownBroker; score: number } | null {
  const q = normalizeBrokerQuery(query);
  if (!q) return null;
  let best: { broker: KnownBroker; score: number } | null = null;
  for (const broker of KNOWN_MT5_BROKERS) {
    let score = 0;
    for (const identity of identities(broker)) {
      score = Math.max(score, matchScore(q, identity));
    }
    if (score > 0 && (!best || score > best.score)) best = { broker, score };
  }
  return best;
}

function unsupportedMatch(query: string): UnsupportedPlatform | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  for (const platform of UNSUPPORTED_PLATFORMS) {
    if (platform.pattern.test(trimmed)) return platform;
  }
  return null;
}

function result(
  kind: BrokerSupportKind,
  match: BrokerSupportMatch | null,
  explanation?: string,
): BrokerSupportResult {
  return {
    kind,
    title: BROKER_SUPPORT_TITLES[kind],
    explanation: explanation ?? BROKER_SUPPORT_EXPLANATIONS[kind],
    match,
  };
}

/**
 * Verdict for a typed or picked broker / server name.
 *
 * Empty input is not a verdict. Unsupported wins over known so `ICMarkets-MT4`
 * is refused even though IC Markets itself is supported.
 */
export function lookupBrokerSupport(query: string): BrokerSupportResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const blocked = unsupportedMatch(trimmed);
  if (blocked) {
    return result("unsupported", {
      id: blocked.id,
      name: blocked.name,
      sampleServer: null,
    });
  }

  const known = bestKnownMatch(trimmed);
  if (known) {
    return result("known", {
      id: known.broker.id,
      name: known.broker.name,
      sampleServer: sampleServerFor(known.broker),
    });
  }

  return result("unknown", null);
}

export function listPopularBrokers(): KnownBroker[] {
  return KNOWN_MT5_BROKERS.filter((b) => b.popular);
}

export function suggestKnownBrokers(query: string, limit = 6): BrokerSupportMatch[] {
  const q = normalizeBrokerQuery(query);
  const pool = q ? KNOWN_MT5_BROKERS : listPopularBrokers();
  const ranked = pool
    .map((broker) => {
      if (!q) return { broker, score: 1 };
      let score = 0;
      for (const identity of identities(broker)) {
        const n = normalizeBrokerQuery(identity);
        if (!n) continue;
        if (n === q) score = Math.max(score, 100);
        else if (n.startsWith(q)) score = Math.max(score, 70 + q.length);
        else if (q.length >= 2 && n.includes(q)) score = Math.max(score, 40);
      }
      return { broker, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.broker.name.localeCompare(b.broker.name));

  return ranked.slice(0, limit).map(({ broker }) => ({
    id: broker.id,
    name: broker.name,
    sampleServer: sampleServerFor(broker),
  }));
}

export function pickBrokerServer(brokerId: string): string | null {
  const broker = KNOWN_MT5_BROKERS.find((b) => b.id === brokerId);
  return broker ? sampleServerFor(broker) : null;
}

/** True when the typed string is already a listed name or server, not a prefix. */
export function isExactKnownIdentity(query: string): boolean {
  const q = normalizeBrokerQuery(query);
  if (!q) return false;
  for (const broker of KNOWN_MT5_BROKERS) {
    for (const identity of identities(broker)) {
      if (q === normalizeBrokerQuery(identity)) return true;
    }
  }
  return false;
}
