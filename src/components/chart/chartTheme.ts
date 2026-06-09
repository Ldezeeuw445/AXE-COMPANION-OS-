/**
 * AXE Chart Theme System
 *
 * 4 presets: Midnight (OLED black), Charcoal (warm dark), Slate (TradingView-style),
 * Paper (light mode). Each preset defines candle, grid, axis, and overlay colors
 * calibrated for legibility on its background.
 *
 * The L-shaped axis separator is always rendered — its color adapts per theme.
 */

export type ChartThemeKey = "midnight" | "charcoal" | "slate" | "paper";

export interface ChartThemeConfig {
  key: ChartThemeKey;
  label: string;
  /** Base color of the chart frame. */
  background: string;
  /** Chart canvas itself. */
  chartCanvasBackground: string;
  textColor: string;
  grid: string;
  crosshair: string;
  /** Color of the L-shaped axis separator line. */
  axisSeparator: string;
  borderColor: string;
  bull: string;
  bear: string;
  bullWick: string;
  bearWick: string;
  /** Crosshair label background. */
  crosshairLabelBg: string;
  entryLine: string;
  stopLine: string;
  takeLine: string;
  pendingLine: string;
  alertLine: string;
  positiveText: string;
  negativeText: string;
  neutralText: string;
  cyanAccent: string;
  frameGlow: string;
  /** Dark theme? Used by overlays to pick text/bg colors. */
  isDark: boolean;
}

/* ── Theme presets ──────────────────────────────────────────────── */

const MIDNIGHT: ChartThemeConfig = {
  key: "midnight",
  label: "Midnight",
  background: "#0c0c0c",
  chartCanvasBackground: "#0c0c0c",
  textColor: "rgba(220,230,245,0.90)",
  grid: "rgba(255,255,255,0.03)",
  crosshair: "rgba(0,224,255,0.35)",
  axisSeparator: "rgba(255,255,255,0.08)",
  borderColor: "rgba(255,255,255,0.06)",
  bull: "#1F9C7B",
  bear: "#C95450",
  bullWick: "rgba(31,156,123,0.95)",
  bearWick: "rgba(201,84,80,0.95)",
  crosshairLabelBg: "#141414",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(201,84,80,0.7)",
  takeLine: "rgba(31,156,123,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(31,156,123,0.95)",
  negativeText: "rgba(201,84,80,0.95)",
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.04) inset",
  isDark: true,
};

const CHARCOAL: ChartThemeConfig = {
  key: "charcoal",
  label: "Charcoal",
  background: "#1a1a1a",
  chartCanvasBackground: "#1a1a1a",
  textColor: "rgba(220,225,235,0.88)",
  grid: "rgba(255,255,255,0.05)",
  crosshair: "rgba(0,224,255,0.35)",
  axisSeparator: "rgba(255,255,255,0.10)",
  borderColor: "rgba(255,255,255,0.07)",
  bull: "#26a69a",
  bear: "#ef5350",
  bullWick: "rgba(38,166,154,0.95)",
  bearWick: "rgba(239,83,80,0.95)",
  crosshairLabelBg: "#222222",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(239,83,80,0.7)",
  takeLine: "rgba(38,166,154,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(38,166,154,0.95)",
  negativeText: "rgba(239,83,80,0.95)",
  neutralText: "rgba(139,149,168,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.05) inset",
  isDark: true,
};

const SLATE: ChartThemeConfig = {
  key: "slate",
  label: "Slate",
  background: "#2a2e39",
  chartCanvasBackground: "#2a2e39",
  textColor: "rgba(210,215,225,0.88)",
  grid: "rgba(255,255,255,0.06)",
  crosshair: "rgba(0,224,255,0.35)",
  axisSeparator: "rgba(255,255,255,0.12)",
  borderColor: "rgba(255,255,255,0.08)",
  bull: "#26a69a",
  bear: "#ef5350",
  bullWick: "rgba(38,166,154,0.95)",
  bearWick: "rgba(239,83,80,0.95)",
  crosshairLabelBg: "#323640",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(239,83,80,0.7)",
  takeLine: "rgba(38,166,154,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(38,166,154,0.95)",
  negativeText: "rgba(239,83,80,0.95)",
  neutralText: "rgba(150,158,175,0.95)",
  cyanAccent: "rgba(0,224,255,0.80)",
  frameGlow: "0 0 0 1px rgba(255,255,255,0.06) inset",
  isDark: true,
};

const PAPER: ChartThemeConfig = {
  key: "paper",
  label: "Paper",
  background: "#d7d6d0",
  chartCanvasBackground: "#d7d6d0",
  textColor: "rgba(30,35,45,0.88)",
  grid: "rgba(0,0,0,0.06)",
  crosshair: "rgba(0,140,200,0.40)",
  axisSeparator: "rgba(0,0,0,0.14)",
  borderColor: "rgba(0,0,0,0.08)",
  bull: "#089981",
  bear: "#f23645",
  bullWick: "rgba(8,153,129,0.95)",
  bearWick: "rgba(242,54,69,0.95)",
  crosshairLabelBg: "#c8c7c2",
  entryLine: "rgba(60,120,220,0.7)",
  stopLine: "rgba(242,54,69,0.7)",
  takeLine: "rgba(8,153,129,0.7)",
  pendingLine: "rgba(60,120,220,0.45)",
  alertLine: "rgba(200,150,50,0.6)",
  positiveText: "rgba(8,153,129,0.95)",
  negativeText: "rgba(242,54,69,0.95)",
  neutralText: "rgba(80,85,95,0.95)",
  cyanAccent: "rgba(0,160,200,0.80)",
  frameGlow: "0 0 0 1px rgba(0,0,0,0.06) inset",
  isDark: false,
};

/* ── Public API ─────────────────────────────────────────────────── */

export const CHART_THEMES: Record<ChartThemeKey, ChartThemeConfig> = {
  midnight: MIDNIGHT,
  charcoal: CHARCOAL,
  slate: SLATE,
  paper: PAPER,
};

export const CHART_THEME_KEYS: ChartThemeKey[] = ["midnight", "charcoal", "slate", "paper"];

/** Get a theme config by key. Falls back to midnight. */
export function getChartTheme(key?: string | null): ChartThemeConfig {
  if (key && key in CHART_THEMES) return CHART_THEMES[key as ChartThemeKey];
  return MIDNIGHT;
}

/**
 * Backward-compat default export — same as midnight.
 * Components that are *not yet* theme-aware can keep using this.
 */
export const CHART_THEME = MIDNIGHT;

/* ── localStorage helpers ──────────────────────────────────────── */

const STORAGE_KEY = "axe-chart-theme";

export function readChartThemeKey(): ChartThemeKey {
  if (typeof window === "undefined") return "midnight";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in CHART_THEMES) return stored as ChartThemeKey;
  return "midnight";
}

export function writeChartThemeKey(key: ChartThemeKey): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
}
