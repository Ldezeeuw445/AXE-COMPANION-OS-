/**
 * Every chart line must be visible on the canvas it is drawn on.
 *
 * Measured on 2026-10-11, before this guard existed: nine colours scored under
 * WCAG 1.4.11's 3:1 for graphical objects. Among them the stop-loss line on
 * the dark theme (2.81:1) and the sell order line on the light theme (2.96:1)
 * — the two lines a trader most needs to find in a hurry.
 *
 * "Looks fine to me" is not a measurement, and it is especially not one on a
 * screen in sunlight.
 *
 * Run: node scripts/verify-chart-contrast.mjs
 */
import assert from "node:assert/strict";
import { CHART_THEMES, CHART_THEME_KEYS } from "../src/components/chart/chartTheme.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** WCAG 1.4.11 — non-text contrast for graphical objects. */
const MIN_RATIO = 3;

function parseColor(c) {
  const s = String(c).trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

const channel = (v) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const flatten = (fg, bg) => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
];
function contrast(fg, bg) {
  const a = luminance(flatten(fg, bg)) + 0.05;
  const b = luminance(bg) + 0.05;
  return a > b ? a / b : b / a;
}

/** Everything a trader reads off the canvas. */
const MEASURED = [
  "entryLine",
  "stopLine",
  "takeLine",
  "pendingLine",
  "alertLine",
  "orderBuy",
  "orderSell",
  "textColor",
  "positiveText",
  "negativeText",
  "neutralText",
  "crosshair",
];


/**
 * Brettel-style deuteranopia approximation, good enough to answer "would these
 * two still look different?". Not a clinical model, and it does not need to be.
 */
function simulateDeuteranopia([r, g, b]) {
  return [
    0.625 * r + 0.375 * g + 0.0 * b,
    0.7 * r + 0.3 * g + 0.0 * b,
    0.0 * r + 0.3 * g + 0.7 * b,
  ];
}

console.log("chart contrast");

for (const key of CHART_THEME_KEYS) {
  const theme = CHART_THEMES[key];
  const bg = parseColor(theme.chartCanvasBackground);

  check(`${theme.label}: every line clears ${MIN_RATIO}:1 on its own canvas`, () => {
    const failures = [];
    for (const field of MEASURED) {
      const fg = parseColor(theme[field]);
      assert.ok(fg, `${theme.label}.${field} is not a colour this guard can read: ${theme[field]}`);
      const ratio = contrast(fg, bg);
      if (ratio < MIN_RATIO) failures.push(`${field} ${theme[field]} → ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, [], `invisible on ${theme.label}:\n  ${failures.join("\n  ")}`);
  });

  check(`${theme.label}: candles are legible`, () => {
    // A hollow candle body carries its contrast in the border, not the fill —
    // that is deliberate TradingView styling, not an oversight. Measure
    // whichever one is actually doing the work.
    for (const side of ["bull", "bear"]) {
      const body = parseColor(theme[side]);
      const border = parseColor(theme[`${side}Border`]);
      const best = theme.borderVisible
        ? Math.max(contrast(body, bg), contrast(border, bg))
        : contrast(body, bg);
      assert.ok(
        best >= MIN_RATIO,
        `${theme.label} ${side} candle is invisible: body ${theme[side]}, border ${theme[`${side}Border`]} → ${best.toFixed(2)}:1`,
      );
    }
  });

  check(`${theme.label}: buy and sell stay apart for a colour-blind trader`, () => {
    // Luminance contrast is the wrong test here: blue and red at the same
    // luminance are easy to tell apart with normal vision. The real risk is
    // red/green confusion, which affects roughly one man in twelve — and a
    // trader who cannot tell a buy line from a sell line will eventually read
    // one as the other on a fast chart.
    const buy = simulateDeuteranopia(parseColor(theme.orderBuy));
    const sell = simulateDeuteranopia(parseColor(theme.orderSell));
    const distance = Math.hypot(buy[0] - sell[0], buy[1] - sell[1], buy[2] - sell[2]);
    assert.ok(
      distance >= 60,
      `through deuteranopia, buy ${theme.orderBuy} and sell ${theme.orderSell} are ${distance.toFixed(0)} apart in RGB — too close to read at a glance`,
    );
  });
}

console.log(`\n${passed} checks passed`);
