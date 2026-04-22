export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function formatMarketCap(v) {
  if (!v || v <= 0) return "—";
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
  return "$" + v.toFixed(0);
}

export function formatPrice(p) {
  if (p == null) return "—";
  if (p >= 1000) return p.toFixed(0);
  if (p >= 100) return p.toFixed(1);
  return p.toFixed(2);
}

export const TIMEFRAMES = ["1D", "1W", "1M", "YTD", "1Y"];
export const METRIC_MODES = [
  { id: "performance", label: "Performance" },
  { id: "volume", label: "Rel Volume" },
  { id: "pe", label: "P/E Ratio" },
];
