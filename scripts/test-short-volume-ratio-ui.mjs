/**
 * INTEL-FREE — short-volume elevated accent threshold.
 * Run: npm run test:short-volume-ratio-ui
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, "../src/lib/intel/shortVolumeRatioUi.ts");
const src = readFileSync(srcPath, "utf8");

assert.match(src, /export const SHORT_VOLUME_ELEVATED_RATIO\s*=\s*0\.4\b/);
assert.match(src, /export function isElevatedShortVolumeRatio/);
assert.match(src, /export function shortVolumeRatioUi/);

// Inline mirror (no TS loader required).
const SHORT_VOLUME_ELEVATED_RATIO = 0.4;

function isElevatedShortVolumeRatio(shortRatio, threshold = SHORT_VOLUME_ELEVATED_RATIO) {
  return Number.isFinite(shortRatio) && shortRatio >= threshold;
}

function shortVolumeRatioUi(shortRatio) {
  const pct = Number.isFinite(shortRatio) ? Math.round(shortRatio * 100) : 0;
  const elevated = isElevatedShortVolumeRatio(shortRatio);
  return {
    label: `${pct}% short`,
    elevated,
    ratioClassName: elevated ? "text-amber-300" : "text-tos-muted",
    rowClassName: elevated ? "border-amber-300/25" : "border-white/[0.05]",
  };
}

assert.equal(isElevatedShortVolumeRatio(0.39), false);
assert.equal(isElevatedShortVolumeRatio(0.4), true);
assert.equal(isElevatedShortVolumeRatio(0.5), true);
assert.equal(isElevatedShortVolumeRatio(Number.NaN), false);
assert.equal(isElevatedShortVolumeRatio(0.3, 0.25), true);

const muted = shortVolumeRatioUi(0.25);
assert.equal(muted.label, "25% short");
assert.equal(muted.elevated, false);
assert.equal(muted.ratioClassName, "text-tos-muted");
assert.equal(muted.rowClassName, "border-white/[0.05]");

const hot = shortVolumeRatioUi(0.52);
assert.equal(hot.label, "52% short");
assert.equal(hot.elevated, true);
assert.equal(hot.ratioClassName, "text-amber-300");
assert.equal(hot.rowClassName, "border-amber-300/25");

const pagePath = join(__dirname, "../src/app/(app)/intel/page.tsx");
const page = readFileSync(pagePath, "utf8");
assert.match(page, /from ["']@\/lib\/intel\/shortVolumeRatioUi["']/);
assert.doesNotMatch(page, /elevated = false/);
assert.doesNotMatch(page, /TODO\(learning\):\s*choose elevated-short/);

console.log("ok: short-volume-ratio-ui");
