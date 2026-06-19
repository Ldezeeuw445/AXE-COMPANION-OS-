/** Maps human / AXE indicator names to ChartScreen flag keys. */

export const SMC_FLAG_KEYS = [
  "structure",
  "orderBlocks",
  "fvg",
  "ifvg",
  "pdh",
  "pdl",
  "pdq",
  "sessionOpen",
  "swingPoints",
  "supplyDemand",
] as const;

export const INDICATOR_FLAG_KEYS = [
  "volume",
  "ma",
  "macd",
  "bollinger",
  "rsi",
  "vwap",
  "poc",
] as const;

export type SmcFlagKey = (typeof SMC_FLAG_KEYS)[number];
export type IndicatorFlagKey = (typeof INDICATOR_FLAG_KEYS)[number];

const SMC_ALIASES: Record<string, SmcFlagKey> = {
  structure: "structure",
  "market structure": "structure",
  ms: "structure",
  bos: "structure",
  orderblock: "orderBlocks",
  "order block": "orderBlocks",
  "order blocks": "orderBlocks",
  ob: "orderBlocks",
  fvg: "fvg",
  "fair value gap": "fvg",
  ifvg: "ifvg",
  "inverse fvg": "ifvg",
  ifvg_auto: "ifvg",
  pdh: "pdh",
  "previous day high": "pdh",
  pdl: "pdl",
  "previous day low": "pdl",
  pdq: "pdq",
  sessionopen: "sessionOpen",
  "session open": "sessionOpen",
  open: "sessionOpen",
  "day open": "sessionOpen",
  swing: "swingPoints",
  "swing points": "swingPoints",
  "supply demand": "supplyDemand",
  "supply/demand": "supplyDemand",
  sd: "supplyDemand",
  "s/d": "supplyDemand",
};

const INDICATOR_ALIASES: Record<string, IndicatorFlagKey> = {
  volume: "volume",
  vol: "volume",
  ma: "ma",
  movingaverage: "ma",
  "moving average": "ma",
  ema: "ma",
  sma: "ma",
  macd: "macd",
  bollinger: "bollinger",
  bb: "bollinger",
  rsi: "rsi",
  vwap: "vwap",
  poc: "poc",
};

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function resolveIndicatorNames(names: string[]): {
  smc: SmcFlagKey[];
  indicators: IndicatorFlagKey[];
  unknown: string[];
} {
  const smc: SmcFlagKey[] = [];
  const indicators: IndicatorFlagKey[] = [];
  const unknown: string[] = [];

  for (const raw of names) {
    const key = normalizeName(raw);
    const smcHit = SMC_ALIASES[key];
    const indHit = INDICATOR_ALIASES[key];
    if (smcHit) {
      if (!smc.includes(smcHit)) smc.push(smcHit);
    } else if (indHit) {
      if (!indicators.includes(indHit)) indicators.push(indHit);
    } else {
      unknown.push(raw);
    }
  }

  return { smc, indicators, unknown };
}

export function describeResolvedLayers(smc: SmcFlagKey[], indicators: IndicatorFlagKey[]): string {
  const parts = [...smc, ...indicators];
  return parts.length > 0 ? parts.join(", ") : "none";
}
