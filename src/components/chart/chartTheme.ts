/**
 * Premium dark trader-grade palette for the AXE chart.
 *
 * Inspiration: Trading OS landing dark UI + matte broker terminal.
 * Bull/bear stay readable on phones without becoming candy-bright.
 */
export const CHART_THEME = {
  /** Base color of the chart frame — sits on top of the woven app background. */
  background: "#070C13",
  /** Chart canvas itself stays solid/flat so it feels like a native trading terminal. */
  chartCanvasBackground: "#05070A",
  textColor: "rgba(208,220,234,0.92)",
  grid: "rgba(110,170,200,0.05)",
  crosshair: "rgba(140,200,220,0.48)",
  borderColor: "rgba(110,170,200,0.10)",
  // Bull: muted dark emerald-teal — luxe, niet candy.
  bull: "#1F9C7B",
  // Bear: warm coral red — deeper than candy pink, brighter than rust.
  bear: "#C95450",
  bullWick: "rgba(31,156,123,0.95)",
  bearWick: "rgba(201,84,80,0.95)",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(201,84,80,0.7)",
  takeLine: "rgba(31,156,123,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(31,156,123,0.95)",
  negativeText: "rgba(201,84,80,0.95)",
  neutralText: "rgba(168,180,196,0.95)",
  cyanAccent: "rgba(33,212,216,0.85)",
  /** Thin edge only; avoid a floating/3D card feel on the chart tab. */
  frameGlow: "0 0 0 1px rgba(255,255,255,0.04) inset",
} as const;
