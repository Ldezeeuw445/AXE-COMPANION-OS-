/**
 * Finviz-style 6-step diverging color scale.
 * Red = negative, dark-grey = neutral, green = positive.
 * Designed for dark backgrounds — desaturated, not neon.
 */

const RED_STEPS = [
  { bound: -6, color: "#7a1f24" }, // worst
  { bound: -4, color: "#9e2a31" },
  { bound: -2, color: "#b8383e" },
  { bound: -1, color: "#8a3237" },
  { bound: -0.25, color: "#5a2a2d" },
];

const NEUTRAL = "#2a2d31";

const GREEN_STEPS = [
  { bound: 0.25, color: "#1f4a34" },
  { bound: 1, color: "#226b43" },
  { bound: 2, color: "#2a8c56" },
  { bound: 4, color: "#2fa668" },
  { bound: 6, color: "#1fbf75" }, // best
];

export function performanceColor(pct) {
  if (pct == null || Number.isNaN(pct)) return NEUTRAL;
  if (pct < 0) {
    for (const step of RED_STEPS) {
      if (pct <= step.bound) return step.color;
    }
    return NEUTRAL;
  }
  if (pct > 0) {
    let out = NEUTRAL;
    for (const step of GREEN_STEPS) {
      if (pct >= step.bound) out = step.color;
    }
    return out;
  }
  return NEUTRAL;
}

/**
 * Volume mode: log scale, warmer = higher relvol.
 * relVol = volume / avgVolume
 */
export function volumeColor(relVol) {
  if (!relVol || relVol <= 0) return NEUTRAL;
  if (relVol < 0.5) return "#2a2d31";
  if (relVol < 0.8) return "#3a3d41";
  if (relVol < 1.2) return "#4a4d51";
  if (relVol < 1.8) return "#6b5a3a";
  if (relVol < 2.5) return "#8c7535";
  if (relVol < 4) return "#b8933a";
  return "#f5a524";
}

/**
 * P/E mode: lower is "cheaper" (greener), higher is "expensive" (redder).
 * Negative earnings -> neutral.
 */
export function peColor(pe) {
  if (pe == null || pe <= 0 || !Number.isFinite(pe)) return NEUTRAL;
  if (pe < 10) return "#2fa668";
  if (pe < 15) return "#2a8c56";
  if (pe < 20) return "#226b43";
  if (pe < 25) return "#3a3d41";
  if (pe < 35) return "#5a2a2d";
  if (pe < 50) return "#8a3237";
  return "#9e2a31";
}

export function getMetricExtractor(mode, timeframe) {
  if (mode === "volume") {
    return (t) => {
      if (!t.volume || !t.avgVolume) return 0;
      return t.volume / t.avgVolume;
    };
  }
  if (mode === "pe") {
    return (t) => t.peRatio ?? 0;
  }
  // performance
  return (t) => (t.changes && t.changes[timeframe]) ?? 0;
}

export function getColorFn(mode) {
  if (mode === "volume") return volumeColor;
  if (mode === "pe") return peColor;
  return performanceColor;
}

export function formatMetric(mode, value) {
  if (mode === "volume") {
    if (!value) return "—";
    return value.toFixed(2) + "x";
  }
  if (mode === "pe") {
    if (!value || value <= 0) return "—";
    return value.toFixed(1);
  }
  // performance
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(2) + "%";
}
