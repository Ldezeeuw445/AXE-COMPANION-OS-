/** URL keys → MetaApi historical-market-data timeframe segment (see MetaApi REST). */
export const CHART_TF_MAP: Record<string, string> = {
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h4: "4h",
  d1: "1d",
};

export const CHART_TF_DEFAULT_KEY = "h1";

export function normalizeChartTfKey(raw: string | undefined): string {
  const k = (raw ?? "").toLowerCase().trim();
  if (k && k in CHART_TF_MAP) return k;
  return CHART_TF_DEFAULT_KEY;
}

export function metaApiTimeframeFromKey(key: string): string {
  return CHART_TF_MAP[key] ?? CHART_TF_MAP[CHART_TF_DEFAULT_KEY];
}

export const CHART_TF_OPTIONS: { key: string; label: string }[] = [
  { key: "m5", label: "M5" },
  { key: "m15", label: "M15" },
  { key: "m30", label: "M30" },
  { key: "h1", label: "H1" },
  { key: "h4", label: "H4" },
  { key: "d1", label: "D1" },
];
