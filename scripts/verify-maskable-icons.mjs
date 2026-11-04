/**
 * The icon Android is allowed to cut into.
 *
 * A maskable icon is not a second copy of the app icon. The launcher crops it
 * to whatever shape that phone uses — a circle, a squircle, a rounded square —
 * and only the inner circle, 80% of the canvas, is guaranteed to survive. Art
 * that fills the square edge to edge is correct for `purpose: "any"` and wrong
 * here: the corners of the AXE mark get sliced off, and nobody sees it because
 * the developer's phone uses the one mask that happens to spare it.
 *
 * This check exists because the two files were shipped byte-identical. The
 * manifest test passed — it reads the manifest, which did declare both
 * purposes — so nothing downstream noticed that the maskable icon had no
 * safe zone at all.
 *
 * Run: node scripts/verify-maskable-icons.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import sharp from "sharp";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * The background of these icons is grey (r == g == b); the mark is not. So the
 * mark is exactly the pixels with chroma, and its bounding box can be measured
 * without knowing anything about the artwork.
 */
async function markBox(path) {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, maxX = -1, minY = height, maxY = -1, coloured = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 18) continue;
      coloured += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  assert.ok(coloured > 0, `${path} has no coloured mark to measure`);
  const centreX = width / 2, centreY = height / 2;
  // The mark may sit off-centre; what matters is its furthest corner from the
  // centre of the canvas, because that is where the mask cuts.
  const reach = Math.max(
    Math.hypot(minX - centreX, minY - centreY),
    Math.hypot(maxX - centreX, minY - centreY),
    Math.hypot(minX - centreX, maxY - centreY),
    Math.hypot(maxX - centreX, maxY - centreY),
  );
  return { width, height, reach, box: { minX, maxX, minY, maxY } };
}

/** The guaranteed-visible circle is 80% of the canvas, so its radius is 0.4 W. */
const safeRadius = (width) => width * 0.4;

const pairs = [
  { any: "public/axe-icon-192.png", maskable: "public/axe-icon-maskable-192.png" },
  { any: "public/axe-icon-512.png", maskable: "public/axe-icon-maskable-512.png" },
];

console.log("the two icons are not the same picture");

for (const { any, maskable } of pairs) {
  await check(`${maskable} is its own artwork, not a copy of ${any}`, () => {
    assert.notEqual(
      digest(maskable),
      digest(any),
      `${maskable} is byte-identical to ${any}; a full-bleed icon has no safe zone`,
    );
  });
}

console.log("");
console.log("the mark survives the crop");

for (const { maskable } of pairs) {
  await check(`${maskable} keeps its mark inside the 80% safe circle`, async () => {
    const { width, reach } = await markBox(maskable);
    const safe = safeRadius(width);
    assert.ok(
      reach <= safe,
      `mark reaches ${reach.toFixed(1)}px from centre, ${(reach - safe).toFixed(1)}px past the ${safe.toFixed(1)}px a circular mask keeps`,
    );
  });
}

console.log("");
console.log("and the plain icon is still allowed to fill its square");

for (const { any } of pairs) {
  await check(`${any} is not padded down to the maskable safe zone`, async () => {
    // Padding the "any" icon too would make every home screen show a small
    // mark floating in a dark square. The two files exist to be different.
    const { width, reach } = await markBox(any);
    assert.ok(
      reach > safeRadius(width),
      `${any} has been shrunk to the safe zone as well; it should use its full square`,
    );
  });
}

console.log("");
console.log(`${passed} checks passed`);
