#!/usr/bin/env node
/**
 * Build maskable 192/512 icons from public/axe-icon-512.png.
 * Safe zone = inner 80% (maskable spec).
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "public/axe-icon-512.png");
const bg = { r: 6, g: 7, b: 10, alpha: 1 };

async function writeMaskable(size, destRel) {
  const dest = resolve(root, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  const inner = Math.round(size * 0.8);
  const icon = await sharp(src).resize(inner, inner, { fit: "contain", background: bg }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: icon, gravity: "centre" }])
    .png()
    .toFile(dest);
  console.log("wrote", destRel);
}

await writeMaskable(192, "public/axe-icon-maskable-192.png");
await writeMaskable(512, "public/axe-icon-maskable-512.png");
