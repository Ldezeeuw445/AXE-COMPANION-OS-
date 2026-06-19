/**
 * Generates Trading OS icon files from the TR logo SVG.
 * Run with: node scripts/generate-trading-os-icons.mjs
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

/** Base TR logo SVG — gradient monogram on dark background */
function makeSvg(size, withBg = true) {
  const bg = withBg
    ? `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.13)}" fill="#0c0c0e"/>`
    : "";
  const scale = size / 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  ${bg}
  <defs>
    <linearGradient id="g" x1="20" y1="25" x2="180" y2="178" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#c6ea00"/>
      <stop offset="48%"  stop-color="#00c4b0"/>
      <stop offset="100%" stop-color="#7c4dff"/>
    </linearGradient>
    <clipPath id="letters">
      <text x="102" y="155"
        text-anchor="middle"
        font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
        font-weight="900"
        font-size="120"
        letter-spacing="-3">TR</text>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="200" height="200" clip-path="url(#letters)" fill="url(#g)"/>
</svg>`;
}

/** Wordmark SVG — icon + "Trading OS" text side by side */
function makeWordmarkSvg(width = 520, height = 100) {
  const iconSize = 72;
  const textX = iconSize + 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${iconSize}" y2="${iconSize}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#c6ea00"/>
      <stop offset="48%"  stop-color="#00c4b0"/>
      <stop offset="100%" stop-color="#7c4dff"/>
    </linearGradient>
    <clipPath id="letters">
      <text x="${iconSize / 2 + 2}" y="${iconSize * 0.78}"
        text-anchor="middle"
        font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
        font-weight="900"
        font-size="${Math.round(iconSize * 0.60)}"
        letter-spacing="-2">TR</text>
    </clipPath>
    <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#eef0f5"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
  </defs>
  <!-- Icon background -->
  <rect x="0" y="${(height - iconSize) / 2}" width="${iconSize}" height="${iconSize}"
    rx="${Math.round(iconSize * 0.18)}" fill="#13161c"/>
  <!-- Icon letters -->
  <rect x="0" y="${(height - iconSize) / 2}" width="${iconSize}" height="${iconSize}"
    clip-path="url(#letters)" fill="url(#g)"
    transform="translate(0, ${(height - iconSize) / 2})"/>
  <!-- Trading OS text -->
  <text x="${textX}" y="${height / 2 + 6}"
    font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
    font-weight="800"
    font-size="38"
    fill="#eef0f5"
    dominant-baseline="middle">Trading</text>
  <text x="${textX + 186}" y="${height / 2 + 6}"
    font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
    font-weight="800"
    font-size="38"
    fill="url(#g)"
    dominant-baseline="middle"> OS</text>
</svg>`;
}

async function generatePng(svgString, outputPath, width, height) {
  await sharp(Buffer.from(svgString))
    .resize(width, height)
    .png()
    .toFile(outputPath);
  console.log(`✓ Generated: ${path.relative(process.cwd(), outputPath)}`);
}

async function main() {
  // Icon 192x192 (PWA icon)
  await generatePng(
    makeSvg(512),
    path.join(publicDir, "trading-os-icon.png"),
    192,
    192
  );

  // Icon 512x512 (PWA maskable)
  await generatePng(
    makeSvg(512),
    path.join(publicDir, "trading-os-icon-512.png"),
    512,
    512
  );

  // Logo (icon only, transparent bg) for avatar/brand mark
  await generatePng(
    makeSvg(512, false),
    path.join(publicDir, "trading-os-logo.png"),
    128,
    128
  );

  // Wordmark PNG (for login / launch screens)
  await generatePng(
    makeWordmarkSvg(520, 100),
    path.join(publicDir, "trading-os-wordmark.png"),
    520,
    100
  );

  // Write the base SVG as well (used as favicon)
  writeFileSync(path.join(publicDir, "trading-os-icon.svg"), makeSvg(200));
  console.log(`✓ Generated: public/trading-os-icon.svg`);

  console.log("\nAll Trading OS icons generated successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
