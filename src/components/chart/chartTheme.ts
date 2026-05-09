/**
 * Premium dark palette for the AXE chart — LuxAlgo Price Action grade.
 *
 * Bull/bear mirror the TradingView LuxAlgo emerald/crimson that traders
 * recognise instantly. Backgrounds are pure near-black for maximum
 * contrast on zones and structure labels.
 */
export const CHART_THEME = {
  background: "#06090E",
  chartCanvasBackground: "#04060A",
  textColor: "rgba(195,208,228,0.88)",
  grid: "rgba(100,140,180,0.035)",
  crosshair: "rgba(160,195,225,0.35)",
  borderColor: "rgba(100,140,180,0.06)",
  bull: "#089981",
  bear: "#F23645",
  bullWick: "rgba(8,153,129,0.92)",
  bearWick: "rgba(242,54,69,0.92)",
  entryLine: "rgba(100,165,245,0.65)",
  stopLine: "rgba(242,54,69,0.65)",
  takeLine: "rgba(8,153,129,0.65)",
  pendingLine: "rgba(100,165,245,0.35)",
  alertLine: "rgba(234,179,82,0.55)",
  positiveText: "rgba(8,153,129,0.95)",
  negativeText: "rgba(242,54,69,0.95)",
  neutralText: "rgba(155,170,190,0.92)",
  cyanAccent: "rgba(8,153,129,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.03) inset",
} as const;
