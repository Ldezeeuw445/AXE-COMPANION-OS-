/**
 * The icon that stops the build.
 *
 * `src/app/favicon.ico` is read by the bundler, not by a browser, and its ICO
 * decoder only accepts RGBA. An ICO holding an 8-bit RGB PNG is a perfectly
 * valid file that every image viewer opens — and `next build` dies on it with
 * "The PNG is not in RGBA format!".
 *
 * That is worse than a normal break, because nothing in the repo fails: the
 * types check, the tests pass, the verify suite is green. Only the build
 * stops, and the build runs on the host. On 29 October that cost 8.8 hours:
 * the VPS pulled every five minutes, failed every time, and production kept
 * serving a commit from that morning while three merged PRs sat unshipped.
 *
 * Run: node scripts/verify-favicon.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import sharp from "sharp";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const ICO = "src/app/favicon.ico";

/**
 * Read the ICO container ourselves: sharp cannot open an .ico, and the whole
 * point is to look at the images inside it the way the bundler does.
 */
function imagesInIco(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt16LE(0), 0, `${path} is not an ICO (reserved field)`);
  assert.equal(buf.readUInt16LE(2), 1, `${path} is not an ICO (type field)`);

  const count = buf.readUInt16LE(4);
  assert.ok(count > 0, `${path} holds no images`);

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    const width = buf.readUInt8(entry) || 256;
    const height = buf.readUInt8(entry + 1) || 256;
    const length = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    out.push({ width, height, data: buf.subarray(offset, offset + length) });
  }
  return out;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

console.log("favicon.ico survives the bundler");

const images = imagesInIco(ICO);

await check(`${ICO} holds at least one image`, () => {
  assert.ok(images.length >= 1, "no entries in the directory");
});

for (const img of images) {
  await check(`its ${img.width}x${img.height} entry carries an alpha channel`, async () => {
    if (!img.data.subarray(0, 4).equals(PNG_MAGIC)) {
      // A classic BMP-encoded entry is fine: the decoder that broke only
      // rejects PNG payloads without alpha.
      return;
    }
    const meta = await sharp(img.data).metadata();
    assert.equal(
      meta.hasAlpha,
      true,
      `the ${img.width}x${img.height} PNG inside ${ICO} is ${meta.channels}-channel without alpha; `
        + `next build rejects it with "The PNG is not in RGBA format!"`,
    );
  });
}

console.log("");
console.log(`${passed} checks passed`);
