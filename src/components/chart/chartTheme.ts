/**
 * Premium dark trader-grade palette for the AXE chart.
 *
 * Inspiration: Trading OS landing dark UI + matte broker terminal.
 * Bull/bear stay readable on phones without becoming candy-bright.
 */
export const CHART_THEME = {
  /** Base color of the chart frame — sits on top of the woven app background. */
  background: "#040a14",
  /** Chart canvas itself stays solid/flat so it feels like a native trading terminal. */
  chartCanvasBackground: "#030810",
  textColor: "rgba(220,230,245,0.90)",
  grid: "rgba(80,140,180,0.04)",
  crosshair: "rgba(0,224,255,0.35)",
  borderColor: "rgba(80,140,180,0.08)",
  // Bull: clean emerald
  bull: "#00d68f",
  // Bear: clean red
  bear: "#ff4757",
  bullWick: "rgba(0,214,143,0.90)",
  bearWick: "rgba(255,71,87,0.90)",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(201,84,80,0.7)",
  takeLine: "rgba(31,156,123,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(0,214,143,0.95)",
  negativeText: "rgba(255,71,87,0.95)",
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  /** Thin edge only; avoid a floating/3D card feel on the chart tab. */
  frameGlow: "0 0 0 1px rgba(255,255,255,0.04) inset",
} as const;
