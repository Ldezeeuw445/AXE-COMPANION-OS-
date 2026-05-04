/**
 * Premium dark trader-grade palette for the AXE chart.
 *
 * Inspiration: Trading OS landing dark UI + matte broker terminal.
 * Bull/bear stay readable on phones without becoming candy-bright.
 */
export const CHART_THEME = {
  background: "#03070C",
  textColor: "rgba(208,220,234,0.92)",
  grid: "rgba(110,170,200,0.06)",
  crosshair: "rgba(140,200,220,0.48)",
  borderColor: "rgba(110,170,200,0.10)",
  // Bull: vibrant teal-green close to AXE accent without going neon.
  bull: "#2BD4A0",
  // Bear: warm coral red — deeper than candy pink, brighter than rust.
  bear: "#E25C58",
  bullWick: "rgba(43,212,160,0.95)",
  bearWick: "rgba(226,92,88,0.95)",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(226,92,88,0.7)",
  takeLine: "rgba(43,212,160,0.65)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(43,212,160,0.95)",
  negativeText: "rgba(226,92,88,0.95)",
  neutralText: "rgba(168,180,196,0.95)",
  cyanAccent: "rgba(33,212,216,0.85)",
  /** Soft inner glow used for the chart frame to evoke "matte + light on it". */
  frameGlow: "0 0 0 1px rgba(34,211,238,0.06) inset, 0 80px 120px -80px rgba(34,211,238,0.18) inset",
} as const;
