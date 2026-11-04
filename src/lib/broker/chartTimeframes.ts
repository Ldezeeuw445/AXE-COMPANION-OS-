/** URL keys → MetaApi historical-market-data timeframe segment (see MetaApi REST). */
export const CHART_TF_MAP: Record<string, string> = {
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h4: "4h",
  d1: "1d",
  w1: "1w",
  mn1: "1mn",
};

export const CHART_TF_DEFAULT_KEY = "h1";

/**
 * Timeframes die we niet bij de broker ophalen maar uit dagcandles vouwen.
 *
 * Een weekcandle is geen eigen meting — het is dezelfde prijs, grover
 * bekeken. Zelf vouwen betekent dat W1 niet leeg kan zijn als D1 werkt, en
 * dat geen enkele broker iets hoeft te ondersteunen. De aggregatie en de
 * redenering staan in `src/lib/chart/aggregateCandles.ts`.
 *
 * `CHART_TF_MAP` noemt hun eigen MetaApi-segment nog wel, want dat is wat ze
 * *zijn*; `fetchTimeframeFromKey` zegt wat er opgehaald moet worden.
 */
export const CHART_TF_FOLDED_FROM_DAILY = new Set(["w1", "mn1"]);

export function normalizeChartTfKey(raw: string | undefined): string {
  const k = (raw ?? "").toLowerCase().trim();
  if (k && k in CHART_TF_MAP) return k;
  return CHART_TF_DEFAULT_KEY;
}

export function metaApiTimeframeFromKey(key: string): string {
  return CHART_TF_MAP[key] ?? CHART_TF_MAP[CHART_TF_DEFAULT_KEY];
}

/** Of deze timeframe uit dagcandles gevouwen wordt in plaats van opgehaald. */
export function isFoldedTimeframe(key: string): boolean {
  return CHART_TF_FOLDED_FROM_DAILY.has(key);
}

/**
 * Welk MetaApi-segment er daadwerkelijk opgehaald moet worden voor deze knop.
 *
 * Voor W1 en MN1 is dat `1d`: die worden daarna gevouwen. Dat betekent ook dat
 * ze de dag-cache delen, dus één ophaalactie bedient drie knoppen.
 */
export function fetchTimeframeFromKey(key: string): string {
  if (isFoldedTimeframe(key)) return CHART_TF_MAP.d1;
  return metaApiTimeframeFromKey(key);
}

export const CHART_TF_OPTIONS: { key: string; label: string }[] = [
  { key: "m5", label: "M5" },
  { key: "m15", label: "M15" },
  { key: "m30", label: "M30" },
  { key: "h1", label: "H1" },
  { key: "h4", label: "H4" },
  { key: "d1", label: "D1" },
  { key: "w1", label: "W1" },
  { key: "mn1", label: "MN" },
];
