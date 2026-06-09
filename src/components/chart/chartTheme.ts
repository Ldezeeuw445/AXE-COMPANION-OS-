/**
 * Premium dark trader-grade palette for the AXE chart.
 *
 * Inspiration: Trading OS landing dark UI + matte broker terminal.
 * Bull/bear stay readable on phones without becoming candy-bright.
 *
 * Uniform matte black — no blue tint. Chart canvas, volume pane, RSI pane
 * and the surrounding frame all share the same neutral black so the whole
 * chart tab feels like one seamless surface.
 */
export const CHART_THEME = {
  /** Base color of the chart frame — matte premium black, not pure #000. */
  background: "#0c0c0c",
  /** Chart canvas itself — same matte black for seamless feel with volume/indicators. */
  chartCanvasBackground: "#0c0c0c",
  textColor: "rgba(220,230,245,0.90)",
  grid: "rgba(255,255,255,0.03)",
  crosshair: "rgba(0,224,255,0.35)",
  borderColor: "rgba(255,255,255,0.06)",
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
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  /** Thin edge only; avoid a floating/3D card feel on the chart tab. */
  frameGlow: "0 0 0 1px rgba(255,255,255,0.04) inset",
} as const;
