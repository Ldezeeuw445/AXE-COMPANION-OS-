/**
 * Map display symbols → keywords + macro series for context filtering.
 * Conservative defaults; falls back to the symbol itself as a keyword.
 */

import type { MacroSnapshotPoint } from "@/lib/market/marketTypes";

export type SymbolBriefing = {
  /** Free-text keywords used for news search. */
  keywords: string[];
  /** ISO currency / asset codes for provider symbol filters where supported. */
  providerSymbols: string[];
  /** FRED series ids surfaced for this symbol. */
  fredSeries: Array<Pick<MacroSnapshotPoint, "seriesId" | "label" | "units">>;
  /** Topical anchors used in the AXE chat brief. */
  anchors: string[];
};

const COMMON_USD_MACRO: SymbolBriefing["fredSeries"] = [
  { seriesId: "DGS10", label: "US 10Y yield", units: "%" },
  { seriesId: "DGS2", label: "US 2Y yield", units: "%" },
  { seriesId: "FEDFUNDS", label: "Fed funds rate", units: "%" },
  { seriesId: "DTWEXBGS", label: "USD broad index", units: "index" },
  { seriesId: "VIXCLS", label: "VIX", units: "index" },
];

const CPI_NFP: SymbolBriefing["fredSeries"] = [
  { seriesId: "CPIAUCSL", label: "US CPI (all items)", units: "index" },
  { seriesId: "PAYEMS", label: "Nonfarm payrolls", units: "thousands" },
  { seriesId: "UNRATE", label: "Unemployment rate", units: "%" },
];

const SYMBOL_MAP: Record<string, SymbolBriefing> = {
  XAUUSD: {
    keywords: ["gold", "XAU", "DXY", "Fed", "real yields", "inflation", "geopolitics"],
    providerSymbols: ["XAU", "XAUUSD", "GOLD"],
    fredSeries: [...COMMON_USD_MACRO, ...CPI_NFP],
    anchors: ["gold/USD", "real yields", "Fed path"],
  },
  XAGUSD: {
    keywords: ["silver", "XAG", "DXY", "industrial demand", "Fed"],
    providerSymbols: ["XAG", "XAGUSD"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["silver/USD", "DXY", "real yields"],
  },
  EURUSD: {
    keywords: ["EUR", "ECB", "Eurozone", "DXY", "Bund yields", "inflation"],
    providerSymbols: ["EUR", "EURUSD"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["ECB vs Fed", "DXY", "Bund/UST spread"],
  },
  GBPUSD: {
    keywords: ["GBP", "BoE", "UK inflation", "DXY"],
    providerSymbols: ["GBP", "GBPUSD"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["BoE vs Fed", "UK CPI"],
  },
  USDJPY: {
    keywords: ["JPY", "BoJ", "Japan yields", "DXY", "intervention risk"],
    providerSymbols: ["USDJPY", "JPY"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["BoJ vs Fed", "10Y spread", "MoF intervention"],
  },
  AUDUSD: {
    keywords: ["AUD", "RBA", "iron ore", "China growth", "DXY"],
    providerSymbols: ["AUD", "AUDUSD"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["China demand", "commodities", "RBA"],
  },
  NZDUSD: {
    keywords: ["NZD", "RBNZ", "dairy", "DXY", "China"],
    providerSymbols: ["NZD", "NZDUSD"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["RBNZ", "global risk"],
  },
  USDCAD: {
    keywords: ["CAD", "BoC", "WTI crude", "DXY"],
    providerSymbols: ["CAD", "USDCAD"],
    fredSeries: [...COMMON_USD_MACRO, { seriesId: "DCOILWTICO", label: "WTI crude oil", units: "USD" }],
    anchors: ["WTI", "BoC vs Fed"],
  },
  USDCHF: {
    keywords: ["CHF", "SNB", "safe haven", "DXY"],
    providerSymbols: ["CHF", "USDCHF"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["SNB stance", "global risk"],
  },
  BTCUSD: {
    keywords: ["Bitcoin", "BTC", "ETF flows", "regulation", "liquidity", "MicroStrategy"],
    providerSymbols: ["BTC", "BTCUSD", "BTC-USD"],
    fredSeries: [
      { seriesId: "FEDFUNDS", label: "Fed funds rate", units: "%" },
      { seriesId: "DTWEXBGS", label: "USD broad index", units: "index" },
      { seriesId: "VIXCLS", label: "VIX", units: "index" },
    ],
    anchors: ["spot BTC ETF flows", "rate cycle", "global liquidity"],
  },
  ETHUSD: {
    keywords: ["Ethereum", "ETH", "ETF", "L2 activity", "regulation"],
    providerSymbols: ["ETH", "ETHUSD"],
    fredSeries: [
      { seriesId: "FEDFUNDS", label: "Fed funds rate", units: "%" },
      { seriesId: "VIXCLS", label: "VIX", units: "index" },
    ],
    anchors: ["ETH ETF", "BTC correlation", "crypto liquidity"],
  },
  NAS100: {
    keywords: ["Nasdaq 100", "mega cap", "Fed", "yields", "earnings", "AI"],
    providerSymbols: ["NDX", "QQQ", "NAS100"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["10Y yield", "AI capex", "earnings"],
  },
  US100: { keywords: [], providerSymbols: [], fredSeries: [], anchors: [] }, // alias filled below
  SPX500: {
    keywords: ["S&P 500", "earnings", "Fed", "yields", "breadth"],
    providerSymbols: ["SPX", "SPY", "SPX500"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["10Y yield", "earnings", "VIX"],
  },
  US500: { keywords: [], providerSymbols: [], fredSeries: [], anchors: [] },
  US30: {
    keywords: ["Dow Jones", "industrials", "Fed"],
    providerSymbols: ["DJI", "US30"],
    fredSeries: COMMON_USD_MACRO,
    anchors: ["earnings", "yields"],
  },
  GER40: {
    keywords: ["DAX", "Germany", "ECB", "Eurozone PMI"],
    providerSymbols: ["DAX", "GER40"],
    fredSeries: [{ seriesId: "DGS10", label: "US 10Y yield", units: "%" }],
    anchors: ["DAX", "ECB"],
  },
  WTI: {
    keywords: ["WTI crude", "oil inventories", "OPEC", "demand"],
    providerSymbols: ["WTI", "USOIL", "CL"],
    fredSeries: [
      { seriesId: "DCOILWTICO", label: "WTI crude oil", units: "USD" },
      { seriesId: "DGS10", label: "US 10Y yield", units: "%" },
    ],
    anchors: ["OPEC+", "inventory", "global demand"],
  },
};

// Aliases
SYMBOL_MAP.US100 = { ...SYMBOL_MAP.NAS100 };
SYMBOL_MAP.US500 = { ...SYMBOL_MAP.SPX500 };

const FALLBACK: SymbolBriefing = {
  keywords: [],
  providerSymbols: [],
  fredSeries: COMMON_USD_MACRO,
  anchors: ["macro", "DXY"],
};

export function briefingForSymbol(symbol: string | null | undefined): SymbolBriefing {
  if (!symbol) return FALLBACK;
  const upper = symbol.toUpperCase();
  return SYMBOL_MAP[upper] ?? { ...FALLBACK, keywords: [upper] };
}

export function dedupeSymbols(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    set.add(v.toUpperCase());
  }
  return Array.from(set);
}
